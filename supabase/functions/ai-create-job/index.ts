// Modifié : logs created_by, getUser(JWT), insert service_role.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import {
  corsPreflightResponse,
  jsonResponse,
} from '../_shared/cors.ts';
import {
  aiGuardBlockedResponse,
  checkAILimitBeforeCall,
} from '../_shared/aiGuard.ts';
import { getRequestUserId, getServiceRoleClient } from '../_shared/supabaseAdmin.ts';

type JobType = 'generate_fiche' | 'translate_fiche';

type CreateJobBody = {
  job_type: JobType;
  payload: Record<string, unknown>;
  model?: string;
};

Deno.serve(async (req: Request): Promise<Response> => {
  console.log('[ai-create-job]', req.method);

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse();
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const admin = getServiceRoleClient();
  if (!admin) {
    return jsonResponse(
      {
        error: 'server_config',
        details:
          'SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquant sur la Edge Function.',
      },
      500,
    );
  }

  let body: CreateJobBody;

  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const { job_type, payload, model } = body;

  if (!job_type || !payload) {
    return jsonResponse(
      { error: 'job_type and payload are required' },
      400,
    );
  }

  if (job_type !== 'generate_fiche' && job_type !== 'translate_fiche') {
    return jsonResponse(
      { error: 'invalid job_type', job_type },
      400,
    );
  }

  const createdBy = await getRequestUserId(req);

  const effectiveModel = model || 'llama-3.1-8b-instant';
  const guard = await checkAILimitBeforeCall(admin, 'groq', effectiveModel);
  if (!guard.allowed) {
    return aiGuardBlockedResponse(guard);
  }

  const baseRow: Record<string, unknown> = {
    job_type,
    payload,
    model: effectiveModel,
    status: 'pending',
    next_run_at: new Date().toISOString(),
  };

  if (createdBy) {
    baseRow.created_by = createdBy;
  }

  let data;
  let error;

  ({ data, error } = await admin.from('ai_jobs').insert(baseRow).select().single());

  if (error?.code === 'PGRST204' && createdBy) {
    console.warn('[ai-create-job] created_by column missing, retry without it');
    delete baseRow.created_by;
    ({ data, error } = await admin.from('ai_jobs').insert(baseRow).select().single());
  }

  if (error) {
    console.error('[ai-create-job] insert failed', error);
    return jsonResponse(
      {
        error: 'insert_failed',
        details: error.message,
        hint: error.hint ?? null,
        code: error.code ?? null,
      },
      500,
    );
  }

  const jobId = (data as { id?: string })?.id;
  console.log(
    `[ai-create-job] Created ai_job ${jobId} for user ${createdBy ?? 'anonymous/null'}`,
  );

  return jsonResponse({ job: data }, 200);
});
