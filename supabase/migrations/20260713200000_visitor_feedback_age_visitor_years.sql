-- Alignement RPC sur la colonne visitor_age (années 1–120).
CREATE OR REPLACE FUNCTION public.patch_visitor_feedback_age(
  p_visitor_id text,
  p_visitor_age integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF nullif(trim(p_visitor_id), '') IS NULL THEN
    RAISE EXCEPTION 'visitor_id requis';
  END IF;
  IF p_visitor_age IS NULL OR p_visitor_age < 1 OR p_visitor_age > 120 THEN
    RAISE EXCEPTION 'visitor_age invalide (1–120 attendu)';
  END IF;

  UPDATE public.visitor_feedback vf
  SET visitor_age = p_visitor_age
  WHERE vf.visitor_id = trim(p_visitor_id)
    AND vf.visitor_age IS NULL;
END;
$$;

COMMENT ON COLUMN public.visitor_feedback.visitor_age IS
  'Âge du visiteur en années, renseigné au carnet de voyage.';
