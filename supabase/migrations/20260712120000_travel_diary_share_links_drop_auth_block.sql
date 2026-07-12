-- Partage carnet : autoriser le propriétaire réel (visitor_id feedback), sans blocage auth incohérent.

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
