-- =============================================================================
-- ai_usage_logs : vérification + politique RLS lecture (backoffice)
-- =============================================================================
-- Structure attendue par l’application (voir src/types/supabase.ts) :
--   id uuid PK, model_id text, provider text,
--   prompt_tokens int, completion_tokens int, total_tokens int,
--   artwork_id uuid nullable, created_at timestamptz
--
-- Les Edge Functions insèrent avec la clé SERVICE_ROLE (bypass RLS).
-- Le tableau « tokens consommés » lit avec le JWT utilisateur → si RLS est
-- activé SANS politique SELECT pour le rôle `authenticated`, PostgREST
-- renvoie souvent 0 ligne (sans erreur) → totaux toujours à 0 dans l’UI.
-- =============================================================================

-- 1) Contrôle rapide : y a-t-il des lignes avec des tokens non nuls ?
-- SELECT id, model_id, provider, prompt_tokens, completion_tokens, total_tokens, created_at
-- FROM public.ai_usage_logs
-- ORDER BY created_at DESC
-- LIMIT 50;

-- SELECT count(*) AS n, coalesce(sum(total_tokens), 0) AS sum_total
-- FROM public.ai_usage_logs;

-- 2) Activer RLS si ce n’est pas déjà fait, puis autoriser la lecture
--    pour les utilisateurs connectés du backoffice.
--    (Adapter le USING () si vous voulez restreindre par rôle / agence.)

ALTER TABLE public.ai_usage_logs ENABLE ROW LEVEL SECURITY;

-- Évite les doublons si le script est relancé
DROP POLICY IF EXISTS "ai_usage_logs_select_authenticated" ON public.ai_usage_logs;

CREATE POLICY "ai_usage_logs_select_authenticated"
  ON public.ai_usage_logs
  FOR SELECT
  TO authenticated
  USING (true);

-- Aucune politique INSERT/UPDATE/DELETE pour `authenticated` : l’écriture
-- reste confined au service_role (Edge Functions).
