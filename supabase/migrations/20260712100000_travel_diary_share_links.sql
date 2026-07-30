-- Liens publics temporaires pour partager un carnet de voyage (30 jours, sans login).

CREATE TABLE IF NOT EXISTS public.travel_diary_share_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE,
  visitor_client_id text NOT NULL,
  expo_id uuid NULL REFERENCES public.expos (id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NULL REFERENCES auth.users (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_travel_diary_share_links_visitor
  ON public.travel_diary_share_links (visitor_client_id);

CREATE INDEX IF NOT EXISTS idx_travel_diary_share_links_expires
  ON public.travel_diary_share_links (expires_at);

ALTER TABLE public.travel_diary_share_links ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.travel_diary_share_links IS
  'Jetons de partage public du carnet visiteur (accès lecture seule, expiration 30 jours).';

-- ---------------------------------------------------------------------------
-- Création / renouvellement d''un lien (réutilise un lien encore valide).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_travel_diary_share_link(
  p_visitor_id text,
  p_expo_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_visitor_id text := nullif(trim(p_visitor_id), '');
  v_existing public.travel_diary_share_links%ROWTYPE;
  v_token text;
  v_expires timestamptz := now() + interval '30 days';
BEGIN
  IF v_visitor_id IS NULL THEN
    RAISE EXCEPTION 'missing_visitor_id';
  END IF;

  IF auth.uid() IS NOT NULL THEN
    IF auth.uid()::text <> v_visitor_id
       AND NOT EXISTS (
         SELECT 1
         FROM public.visitors v
         WHERE v.visitor_client_id = v_visitor_id
           AND v.auth_user_id = auth.uid()
       ) THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.visitor_feedback vf
    WHERE vf.visitor_id = v_visitor_id
    LIMIT 1
  ) THEN
    RAISE EXCEPTION 'no_diary';
  END IF;

  SELECT *
  INTO v_existing
  FROM public.travel_diary_share_links s
  WHERE s.visitor_client_id = v_visitor_id
    AND s.expo_id IS NOT DISTINCT FROM p_expo_id
    AND s.expires_at > now()
  ORDER BY s.created_at DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'token', v_existing.token,
      'expires_at', v_existing.expires_at
    );
  END IF;

  v_token := replace(gen_random_uuid()::text, '-', '')
    || replace(gen_random_uuid()::text, '-', '');

  INSERT INTO public.travel_diary_share_links (
    token,
    visitor_client_id,
    expo_id,
    expires_at,
    created_by
  )
  VALUES (
    v_token,
    v_visitor_id,
    p_expo_id,
    v_expires,
    auth.uid()
  );

  RETURN jsonb_build_object(
    'token', v_token,
    'expires_at', v_expires
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Résolution publique d''un jeton (sans auth).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_travel_diary_share_token(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.travel_diary_share_links%ROWTYPE;
BEGIN
  SELECT *
  INTO v_row
  FROM public.travel_diary_share_links s
  WHERE s.token = nullif(trim(p_token), '')
    AND s.expires_at > now()
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false);
  END IF;

  RETURN jsonb_build_object(
    'valid', true,
    'visitor_id', v_row.visitor_client_id,
    'expo_id', v_row.expo_id,
    'expires_at', v_row.expires_at
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Feedback visiteur accessible via jeton de partage (anon / sans session).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_visitor_feedback_for_share(p_token text)
RETURNS SETOF public.visitor_feedback
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT vf.*
  FROM public.visitor_feedback vf
  INNER JOIN public.travel_diary_share_links s
    ON s.visitor_client_id = vf.visitor_id
  WHERE s.token = nullif(trim(p_token), '')
    AND s.expires_at > now()
  ORDER BY vf.submitted_at ASC
  LIMIT 80;
$$;

GRANT EXECUTE ON FUNCTION public.create_travel_diary_share_link(text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_travel_diary_share_token(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_visitor_feedback_for_share(text) TO anon, authenticated;
