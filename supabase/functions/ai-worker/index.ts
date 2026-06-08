// Modifié : logs, body job_id, Groq lazy, updated_at, traitement ciblé d’un job.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import Groq from 'npm:groq-sdk';
import {
  corsPreflightResponse,
  jsonResponse,
} from '../_shared/cors.ts';
import { getServiceRoleClient } from '../_shared/supabaseAdmin.ts';
import {
  aiGuardBlockedResponse,
  checkAILimitBeforeCall,
} from '../_shared/aiGuard.ts';
import {
  insertAiUsageLog,
  tokensFromGroqOpenAiUsage,
} from '../_shared/ai_usage_log.ts';
import { ingestGroqRateLimitHeaders } from '../_shared/groqObservedLimits.ts';
import { sanitizeTranslationOutput } from '../_shared/sanitizeTranslation.ts';

type AiJob = {
  id: string;
  created_at: string;
  updated_at: string;
  job_type: 'generate_fiche' | 'translate_fiche';
  payload: Record<string, unknown>;
  model: string;
  status: 'pending' | 'running' | 'done' | 'error' | 'retry_later';
  attempts: number;
  next_run_at: string | null;
  result: unknown;
  error: unknown;
};

type WorkerBody = {
  job_id?: string;
};

type GroqChatMessage = { role: 'system' | 'user'; content: string };

type GroqChatCompletion = {
  choices?: Array<{ message?: { content?: string | null } }>;
  model?: string;
  usage?: unknown;
};

type GroqChatCreateParams = {
  model: string;
  messages: GroqChatMessage[];
  max_tokens: number;
  temperature: number;
};

type GroqApiPromiseWithResponse = {
  withResponse: () => Promise<{ data: GroqChatCompletion; response: Response }>;
};

const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions';

/**
 * groq-sdk expose les headers via `.withResponse()` (Response Web fetch native).
 * Repli : fetch natif avec le même payload JSON si `.withResponse` est absent.
 */
async function createGroqChatCompletion(params: {
  apiKey: string;
  supabase: NonNullable<ReturnType<typeof getServiceRoleClient>>;
  request: GroqChatCreateParams;
}): Promise<GroqChatCompletion> {
  const groq = new Groq({ apiKey: params.apiKey });
  const pending = groq.chat.completions.create(params.request);

  const withResponse = (pending as unknown as Partial<GroqApiPromiseWithResponse>).withResponse;
  if (typeof withResponse === 'function') {
    const { data, response } = await withResponse.call(pending);
    if (response.ok) {
      ingestGroqRateLimitHeaders(params.supabase, params.request.model, response);
    }
    return data;
  }

  console.warn('[ai-worker] groq-sdk sans .withResponse() — repli fetch natif pour headers rate limit');

  const res = await fetch(GROQ_CHAT_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params.request),
  });

  if (!res.ok) {
    const details = await res.text();
    const err = new Error(details || `Groq HTTP ${res.status}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }

  ingestGroqRateLimitHeaders(params.supabase, params.request.model, res);
  return (await res.json()) as GroqChatCompletion;
}

/** Journalise la consommation Groq sans bloquer le job principal. */
async function logGroqUsageSafe(
  supabase: NonNullable<ReturnType<typeof getServiceRoleClient>>,
  params: {
    job: AiJob;
    completion: { model?: string; usage?: unknown };
    payload: Record<string, unknown>;
  },
): Promise<void> {
  const { job, completion, payload } = params;
  const modelId = (completion.model ?? job.model ?? '').trim();
  if (!modelId) {
    console.warn('[ai-worker] usage log skipped: model_id vide', { job_id: job.id, job_type: job.job_type });
    return;
  }

  const usageMissing = completion.usage == null;
  if (usageMissing) {
    console.warn('[ai-worker] Groq usage absent dans la réponse', {
      job_id: job.id,
      job_type: job.job_type,
      model_id: modelId,
    });
  }

  const tok = tokensFromGroqOpenAiUsage(completion.usage);
  const artworkId =
    typeof payload.ficheId === 'string' ? payload.ficheId
    : typeof payload.artwork_id === 'string' ? payload.artwork_id
    : null;

  try {
    await insertAiUsageLog(supabase, {
      model_id: modelId,
      provider: 'groq',
      prompt_tokens: tok.prompt_tokens,
      completion_tokens: tok.completion_tokens,
      total_tokens: tok.total_tokens,
      artwork_id: artworkId,
      metadata: {
        job_type: job.job_type,
        source_function: 'ai-worker',
        job_id: job.id,
        ...(usageMissing ? { usage_missing: true } : {}),
      },
    });
  } catch (logErr) {
    console.error('[ai-worker] insertAiUsageLog failed (non-blocking)', {
      job_id: job.id,
      job_type: job.job_type,
      error: logErr instanceof Error ? logErr.message : String(logErr),
    });
  }
}

function getGroqApiKey(): string | null {
  const apiKey = Deno.env.get('GROQ_API_KEY')?.trim();
  if (!apiKey) {
    console.error('[ai-worker] GROQ_API_KEY is not set');
    return null;
  }
  return apiKey;
}

async function parseBody(req: Request): Promise<WorkerBody> {
  if (req.method !== 'POST') return {};
  try {
    const text = await req.text();
    if (!text.trim()) return {};
    return JSON.parse(text) as WorkerBody;
  } catch {
    return {};
  }
}

async function pickJob(
  supabase: NonNullable<ReturnType<typeof getServiceRoleClient>>,
  jobId: string | undefined,
  nowIso: string,
): Promise<{ job: AiJob | null; message?: string }> {
  if (jobId) {
    const { data: rows, error } = await supabase
      .from('ai_jobs')
      .select('*')
      .eq('id', jobId)
      .limit(1);

    if (error) {
      console.error('[ai-worker] select by id failed', error);
      return { job: null, message: error.message };
    }

    const job = (rows?.[0] as AiJob) ?? null;
    if (!job) {
      return { job: null, message: `job ${jobId} not found` };
    }

    const runnable =
      job.status === 'pending' ||
      (job.status === 'retry_later' &&
        job.next_run_at &&
        job.next_run_at <= nowIso);

    if (!runnable) {
      console.log(
        `[ai-worker] job ${jobId} skipped (status=${job.status})`,
      );
      return {
        job: null,
        message: `job not runnable (status=${job.status})`,
      };
    }

    return { job };
  }

  const { data: jobs, error: selectError } = await supabase
    .from('ai_jobs')
    .select('*')
    .eq('status', 'pending')
    .lte('next_run_at', nowIso)
    .order('created_at', { ascending: true })
    .limit(1);

  if (selectError) {
    console.error('[ai-worker] select pending failed', selectError);
    return { job: null, message: selectError.message };
  }

  if (!jobs?.length) {
    return { job: null, message: 'no pending jobs' };
  }

  return { job: jobs[0] as AiJob };
}

Deno.serve(async (req: Request): Promise<Response> => {
  console.log('[ai-worker]', req.method);

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse();
  }

  if (req.method !== 'POST' && req.method !== 'GET') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    const supabase = getServiceRoleClient();
    if (!supabase) {
      return jsonResponse(
        {
          error: 'server_config',
          details:
            'SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquant sur la Edge Function.',
        },
        500,
      );
    }

    const body = await parseBody(req);
    const nowIso = new Date().toISOString();

    console.log(
      '[ai-worker] pick job',
      body.job_id ? `target=${body.job_id}` : 'oldest pending',
    );

    const { job, message } = await pickJob(supabase, body.job_id, nowIso);

    if (!job) {
      console.log('[ai-worker] no job to process:', message);
      return jsonResponse(
        { processed: 0, message: message ?? 'no pending jobs' },
        200,
      );
    }

    console.log(`[ai-worker] processing job ${job.id} (type=${job.job_type})`);

    const { error: updateRunningError } = await supabase
      .from('ai_jobs')
      .update({
        status: 'running',
        attempts: (job.attempts ?? 0) + 1,
        updated_at: nowIso,
      })
      .eq('id', job.id);

    if (updateRunningError) {
      console.error('[ai-worker] update running failed', updateRunningError);
      return jsonResponse(
        { error: 'update_running_failed', details: updateRunningError.message },
        500,
      );
    }

    const payload = job.payload ?? {};
    let systemPrompt = '';
    let userPrompt = '';

    if (job.job_type === 'generate_fiche') {
      systemPrompt = "Tu es un assistant qui génère des fiches d'œuvres d'art.";
      userPrompt = `Génère une fiche en ${payload.langue} pour cette œuvre :\n\n${payload.contenuSource}`;
    } else if (job.job_type === 'translate_fiche') {
      const langLabels: Record<string, string> = {
        fr: 'français',
        en: 'anglais',
        de: 'allemand',
        es: 'espagnol',
        it: 'italien',
      };
      const sourceLabel = langLabels[String(payload.sourceLang ?? '')] ?? String(payload.sourceLang ?? '');
      const targetLabel = langLabels[String(payload.targetLang ?? '')] ?? String(payload.targetLang ?? '');
      systemPrompt =
        'Tu es un traducteur professionnel. Réponds UNIQUEMENT avec le texte traduit, sans introduction, sans guillemets, sans commentaire et sans phrase du type « Voici la traduction ».';
      userPrompt =
        `Traduis le texte suivant du ${sourceLabel} vers le ${targetLabel}. ` +
        `Réponds uniquement avec la traduction, rien d'autre.\n\n${payload.texteSource}`;
    } else {
      await supabase
        .from('ai_jobs')
        .update({
          status: 'error',
          updated_at: new Date().toISOString(),
          error: { message: 'unknown job_type', job_type: job.job_type },
        })
        .eq('id', job.id);

      return jsonResponse(
        { error: 'unknown_job_type', jobId: job.id },
        400,
      );
    }

    const groqApiKey = getGroqApiKey();
    if (!groqApiKey) {
      await supabase
        .from('ai_jobs')
        .update({
          status: 'error',
          updated_at: new Date().toISOString(),
          error: { message: 'GROQ_API_KEY not configured', kind: 'config' },
        })
        .eq('id', job.id);

      return jsonResponse(
        { error: 'groq_not_configured', jobId: job.id },
        500,
      );
    }

    const guard = await checkAILimitBeforeCall(supabase, 'groq', job.model);
    if (!guard.allowed) {
      console.warn('[ai-worker] blocked by aiGuard', guard);
      return aiGuardBlockedResponse(guard);
    }

    console.log(`[ai-worker] calling Groq model=${job.model}`);

    let completion: GroqChatCompletion;
    try {
      completion = await createGroqChatCompletion({
        apiKey: groqApiKey,
        supabase,
        request: {
          model: job.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          max_tokens: 600,
          temperature: 0.4,
        },
      });
    } catch (e: unknown) {
      const err = e as { message?: string; status?: number };
      console.error('[ai-worker] Groq error', err);

      const message = err?.message ?? 'Unknown Groq error';
      const statusCode = err?.status ?? 500;
      const isRateLimit = statusCode === 429;
      const isServerError = statusCode >= 500 && statusCode < 600;

      if (isRateLimit || isServerError) {
        const nextRun = new Date();
        nextRun.setMinutes(nextRun.getMinutes() + 15);

        await supabase
          .from('ai_jobs')
          .update({
            status: 'retry_later',
            next_run_at: nextRun.toISOString(),
            updated_at: new Date().toISOString(),
            error: {
              message,
              statusCode,
              kind: isRateLimit ? 'rate_limit' : 'server_error',
            },
          })
          .eq('id', job.id);

        return jsonResponse(
          {
            processed: 0,
            jobId: job.id,
            retry: 'later',
            reason: isRateLimit ? 'rate_limit' : 'server_error',
          },
          200,
        );
      }

      await supabase
        .from('ai_jobs')
        .update({
          status: 'error',
          updated_at: new Date().toISOString(),
          error: {
            message,
            statusCode,
            kind: 'client_or_config_error',
          },
        })
        .eq('id', job.id);

      return jsonResponse(
        { error: 'groq_error', jobId: job.id, message },
        500,
      );
    }

    const rawText = completion.choices?.[0]?.message?.content ?? '';
    const text =
      job.job_type === 'translate_fiche'
        ? sanitizeTranslationOutput(rawText)
        : rawText;
    console.log(
      `[ai-worker] Groq done job=${job.id} textLen=${text.length}`,
    );

    await logGroqUsageSafe(supabase, { job, completion, payload });

    // Write-back expo_descript_i18n si translate_fiche avec expo_id + targetLang
    if (
      job.job_type === 'translate_fiche' &&
      typeof payload.expo_id === 'string' && payload.expo_id &&
      typeof payload.targetLang === 'string' && payload.targetLang &&
      text
    ) {
      try {
        const { data: expoRow } = await supabase
          .from('expos')
          .select('expo_descript_i18n')
          .eq('id', payload.expo_id)
          .single();
        let current: Record<string, string> = {};
        const raw = (expoRow as { expo_descript_i18n?: unknown } | null)?.expo_descript_i18n;
        if (raw) {
          try {
            if (typeof raw === 'object' && !Array.isArray(raw)) {
              current = raw as Record<string, string>;
            } else if (typeof raw === 'string') {
              current = JSON.parse(raw) as Record<string, string>;
            }
          } catch { current = {}; }
        }
        const updated = { ...current, [payload.targetLang as string]: text };
        const { error: expoWriteErr } = await supabase
          .from('expos')
          .update({ expo_descript_i18n: updated })
          .eq('id', payload.expo_id as string);
        if (expoWriteErr) {
          console.error('[ai-worker] expo_descript_i18n write failed', expoWriteErr.message);
        } else {
          console.log(`[ai-worker] expo_descript_i18n[${payload.targetLang}] written for expo ${payload.expo_id}`);
        }
      } catch (writeErr) {
        console.error('[ai-worker] expo write-back unexpected error', writeErr);
      }
    }

    const { error: updateDoneError } = await supabase
      .from('ai_jobs')
      .update({
        status: 'done',
        updated_at: new Date().toISOString(),
        result: {
          text,
          raw: completion,
        },
      })
      .eq('id', job.id);

    if (updateDoneError) {
      console.error('[ai-worker] update done failed', updateDoneError);
      return jsonResponse(
        {
          error: 'update_done_failed',
          jobId: job.id,
          details: updateDoneError.message,
        },
        500,
      );
    }

    console.log(`[ai-worker] job ${job.id} updated status=done`);

    return jsonResponse(
      { processed: 1, jobId: job.id, textLength: text.length },
      200,
    );
  } catch (e: unknown) {
    const err = e as { message?: string };
    console.error('[ai-worker] unexpected error', e);
    return jsonResponse(
      { error: 'unexpected_error', message: err?.message ?? 'Unknown error' },
      500,
    );
  }
});
