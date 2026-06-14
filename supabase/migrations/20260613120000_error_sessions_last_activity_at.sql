-- Dernière activité des sessions de logs (heartbeat + erreurs) pour la présence en ligne

ALTER TABLE public.organizer_error_sessions
  ADD COLUMN IF NOT EXISTS last_activity_at timestamptz;

ALTER TABLE public.visitor_error_sessions
  ADD COLUMN IF NOT EXISTS last_activity_at timestamptz;

COMMENT ON COLUMN public.organizer_error_sessions.last_activity_at IS
  'Dernier signal client (heartbeat, erreur, début session). Utilisé pour la présence à 3 états.';

COMMENT ON COLUMN public.visitor_error_sessions.last_activity_at IS
  'Dernier signal client (heartbeat, erreur, début session). Utilisé pour la présence à 3 états.';

-- Reprise depuis les logs existants, sinon started_at
UPDATE public.organizer_error_sessions s
SET last_activity_at = GREATEST(
  s.started_at,
  COALESCE(
    (SELECT MAX(l.created_at)
     FROM public.organizer_error_logs l
     WHERE l.session_id = s.id),
    s.started_at
  )
)
WHERE s.last_activity_at IS NULL;

UPDATE public.visitor_error_sessions s
SET last_activity_at = GREATEST(
  s.started_at,
  COALESCE(
    (SELECT MAX(l.created_at)
     FROM public.visitor_error_logs l
     WHERE l.session_id = s.id),
    s.started_at
  )
)
WHERE s.last_activity_at IS NULL;

UPDATE public.organizer_error_sessions
SET last_activity_at = started_at
WHERE last_activity_at IS NULL;

UPDATE public.visitor_error_sessions
SET last_activity_at = started_at
WHERE last_activity_at IS NULL;

ALTER TABLE public.organizer_error_sessions
  ALTER COLUMN last_activity_at SET DEFAULT pg_catalog.now(),
  ALTER COLUMN last_activity_at SET NOT NULL;

ALTER TABLE public.visitor_error_sessions
  ALTER COLUMN last_activity_at SET DEFAULT pg_catalog.now(),
  ALTER COLUMN last_activity_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_organizer_error_sessions_last_activity_at
  ON public.organizer_error_sessions (last_activity_at DESC)
  WHERE ended_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_visitor_error_sessions_last_activity_at
  ON public.visitor_error_sessions (last_activity_at DESC)
  WHERE ended_at IS NULL;
