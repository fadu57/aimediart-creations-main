-- =============================================================================
-- Persona par défaut visiteur (prompt_style.id) — persistance cross-exposition
-- =============================================================================

BEGIN;

ALTER TABLE public.visitors
  ADD COLUMN IF NOT EXISTS persona_defaut uuid
    REFERENCES public.prompt_style (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.visitors.persona_defaut IS
  'Persona (prompt_style.id) choisie par défaut par le visiteur — synchronisée entre expositions.';

CREATE INDEX IF NOT EXISTS idx_visitors_persona_defaut
  ON public.visitors (persona_defaut)
  WHERE persona_defaut IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Lecture légère (lookup fingerprint + visitor_client_id)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_visitor_persona_defaut(
  p_visitor_client_id text DEFAULT NULL,
  p_fingerprint text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.visitors%ROWTYPE;
  cid text := nullif(trim(p_visitor_client_id), '');
  fp text := nullif(trim(p_fingerprint), '');
BEGIN
  IF fp IS NOT NULL THEN
    SELECT v.* INTO v_row
    FROM public.visitors v
    WHERE v.fingerprint = fp
    LIMIT 1;
  END IF;

  IF v_row.id IS NULL AND cid IS NOT NULL THEN
    SELECT v.* INTO v_row
    FROM public.visitors v
    WHERE v.visitor_client_id = cid
    LIMIT 1;
  END IF;

  IF v_row.id IS NULL THEN
    RETURN NULL;
  END IF;

  IF v_row.id IS NOT NULL AND cid IS NOT NULL
     AND nullif(trim(v_row.visitor_client_id), '') IS DISTINCT FROM cid THEN
    UPDATE public.visitors v
    SET visitor_client_id = cid, last_seen_at = now()
    WHERE v.id = v_row.id;
  END IF;

  RETURN v_row.persona_defaut;
END;
$$;

-- ---------------------------------------------------------------------------
-- Écriture (visitor_client_id obligatoire — ligne créée via register_anonymous_visitor)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_visitor_persona_defaut(
  p_visitor_client_id text,
  p_persona_defaut uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  cid text := nullif(trim(p_visitor_client_id), '');
BEGIN
  IF cid IS NULL THEN
    RAISE EXCEPTION 'visitor_client_id requis';
  END IF;

  IF p_persona_defaut IS NOT NULL THEN
    PERFORM 1
    FROM public.prompt_style ps
    WHERE ps.id = p_persona_defaut;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'persona_defaut invalide (prompt_style introuvable)';
    END IF;
  END IF;

  UPDATE public.visitors v
  SET
    persona_defaut = p_persona_defaut,
    last_seen_at = now()
  WHERE v.visitor_client_id = cid
  RETURNING v.id INTO v_id;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'visiteur introuvable pour ce visitor_client_id';
  END IF;

  RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- Profil visiteur : inclure persona_defaut dès qu'une ligne existe
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_anonymous_visitor_profile(
  p_visitor_client_id text DEFAULT NULL,
  p_fingerprint text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.visitors%ROWTYPE;
  cid text := nullif(trim(p_visitor_client_id), '');
  fp text := nullif(trim(p_fingerprint), '');
BEGIN
  IF fp IS NOT NULL THEN
    SELECT v.* INTO v_row
    FROM public.visitors v
    WHERE v.fingerprint = fp
    LIMIT 1;
  END IF;

  IF v_row.id IS NULL AND cid IS NOT NULL THEN
    SELECT v.* INTO v_row
    FROM public.visitors v
    WHERE v.visitor_client_id = cid
    LIMIT 1;
  END IF;

  IF v_row.id IS NOT NULL AND cid IS NOT NULL
     AND nullif(trim(v_row.visitor_client_id), '') IS DISTINCT FROM cid THEN
    UPDATE public.visitors v
    SET visitor_client_id = cid, last_seen_at = now()
    WHERE v.id = v_row.id;
    v_row.visitor_client_id := cid;
  END IF;

  IF v_row.id IS NULL THEN
    RETURN jsonb_build_object('is_returning', false);
  END IF;

  IF nullif(trim(v_row.visitor_pseudo), '') IS NULL THEN
    RETURN jsonb_build_object(
      'is_returning', false,
      'persona_defaut', v_row.persona_defaut
    );
  END IF;

  RETURN jsonb_build_object(
    'is_returning', true,
    'visitor_pseudo', v_row.visitor_pseudo,
    'avatar_url', v_row.avatar_url,
    'avatar_object_path', v_row.avatar_object_path,
    'selfie_url', v_row.selfie_url,
    'selfie_object_path', v_row.selfie_object_path,
    'persona_defaut', v_row.persona_defaut
  );
END;
$$;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND (
        (p.proname = 'get_visitor_persona_defaut' AND p.pronargs = 2)
        OR (p.proname = 'set_visitor_persona_defaut' AND p.pronargs = 2)
        OR (p.proname = 'get_anonymous_visitor_profile' AND p.pronargs = 2)
      )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated, service_role', r.sig);
  END LOOP;
END
$$;

COMMIT;
