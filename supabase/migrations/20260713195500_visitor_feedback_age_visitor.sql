-- Âge visiteur en années (1–120), saisi au carnet de voyage.
ALTER TABLE public.visitor_feedback
  ADD COLUMN IF NOT EXISTS visitor_age integer;

COMMENT ON COLUMN public.visitor_feedback.visitor_age IS
  'Âge du visiteur en années, renseigné au carnet de voyage.';

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

GRANT EXECUTE ON FUNCTION public.patch_visitor_feedback_age(text, integer) TO anon, authenticated;
