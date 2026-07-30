-- Adresse IP des utilisateurs authentifiés (complète visitors.ip_address pour la géographie).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS ip_address text;

COMMENT ON COLUMN public.profiles.ip_address IS
  'Dernière adresse IP publique connue à la connexion (max 256 car.).';

CREATE OR REPLACE FUNCTION public.sync_auth_user_ip_on_login(
  p_ip_address text,
  p_visitor_client_id text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  ip text := left(nullif(trim(p_ip_address), ''), 256);
  cid text := nullif(trim(p_visitor_client_id), '');
BEGIN
  IF uid IS NULL OR ip IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.profiles p
  SET
    ip_address = ip,
    updated_at = now()
  WHERE p.id = uid;

  IF cid IS NOT NULL THEN
    UPDATE public.visitors v
    SET
      auth_user_id = uid,
      ip_address = ip,
      last_seen_at = now()
    WHERE v.visitor_client_id = cid;
  END IF;

  UPDATE public.visitors v
  SET
    ip_address = ip,
    last_seen_at = now()
  WHERE v.auth_user_id = uid;

  RETURN true;
END;
$$;

COMMENT ON FUNCTION public.sync_auth_user_ip_on_login(text, text) IS
  'Persiste l''IP du client sur profiles + visitors liés (auth_user_id ou visitor_client_id).';

REVOKE ALL ON FUNCTION public.sync_auth_user_ip_on_login(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_auth_user_ip_on_login(text, text) TO authenticated;
