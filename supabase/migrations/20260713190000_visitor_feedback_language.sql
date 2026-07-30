-- Langue UI du visiteur au moment du feedback (fr, en, es, de, it).
ALTER TABLE public.visitor_feedback
  ADD COLUMN IF NOT EXISTS language text;

COMMENT ON COLUMN public.visitor_feedback.language IS
  'Code langue interface visiteur (2 lettres) au moment de la soumission du feedback.';
