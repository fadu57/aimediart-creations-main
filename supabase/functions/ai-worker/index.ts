// Modifié : logs, body job_id, Groq lazy, updated_at, traitement ciblé d’un job.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import Groq from 'npm:groq-sdk';
import {
  corsPreflightResponse,
  jsonResponse,
} from '../_shared/cors.ts';
import { getServiceRoleClient } from '../_shared/supabaseAdmin.ts';

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

function getGroqClient(): Groq | null {
  const apiKey = Deno.env.get('GROQ_API_KEY')?.trim();
  if (!apiKey) {
    console.error('[ai-worker] GROQ_API_KEY is not set');
    return null;
  }
  return new Groq({ apiKey });
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
      systemPrompt = 'Tu es un traducteur professionnel.';
      userPrompt = `Traduis ce texte du ${payload.sourceLang} vers le ${payload.targetLang} :\n\n${payload.texteSource}`;
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

    const groq = getGroqClient();
    if (!groq) {
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

    console.log(`[ai-worker] calling Groq model=${job.model}`);

    let completion;
    try {
      completion = await groq.chat.completions.create({
        model: job.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 600,
        temperature: 0.4,
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

    const text = completion.choices[0]?.message?.content ?? '';
    console.log(
      `[ai-worker] Groq done job=${job.id} textLen=${text.length}`,
    );

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
