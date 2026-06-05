-- Catalogue public.avatars pour l'inscription visiteur (pseudos + images déjà en Storage).
-- Les images peuvent exister avant la mise à jour status=done / image_path en base.

BEGIN;

ALTER TABLE public.avatars ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.avatars TO anon, authenticated;

DROP POLICY IF EXISTS "avatars_visitor_public_select_done" ON public.avatars;
DROP POLICY IF EXISTS "avatars_visitor_public_select_catalog" ON public.avatars;

CREATE POLICY "avatars_visitor_public_select_catalog"
ON public.avatars
FOR SELECT
TO anon, authenticated
USING (
  adjective_en IS NOT NULL
  AND noun_en IS NOT NULL
  AND full_pseudo_en IS NOT NULL
);

COMMIT;
