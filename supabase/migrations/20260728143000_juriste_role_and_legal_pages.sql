-- Rôle SaaS « juriste » (role_id 8) + contenus légaux éditables (CGV, etc.).

INSERT INTO public.roles_user (role_id, label, role_name, role_name_clair)
VALUES (8, 'Juriste', 'juriste', 'Juriste')
ON CONFLICT (role_id) DO UPDATE
SET
  label = EXCLUDED.label,
  role_name = EXCLUDED.role_name,
  role_name_clair = EXCLUDED.role_name_clair;

COMMENT ON TABLE public.roles_user IS
  'Catalogue des rôles. 1-3 = SaaS global (app_metadata), 4-6 = agence, 7 = visiteur, 8 = juriste (app_metadata, lecture SaaS + droits ciblés).';

-- ---------------------------------------------------------------------------
-- Contenu des pages légales publiques (override des JSON i18n)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.legal_page_contents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL,
  locale text NOT NULL DEFAULT 'fr',
  body_html text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  CONSTRAINT legal_page_contents_slug_locale_key UNIQUE (slug, locale),
  CONSTRAINT legal_page_contents_slug_chk CHECK (slug ~ '^[a-z0-9_]+$'),
  CONSTRAINT legal_page_contents_locale_chk CHECK (char_length(locale) BETWEEN 2 AND 8)
);

COMMENT ON TABLE public.legal_page_contents IS
  'Corps HTML des pages légales publiques (cgv, privacy…). Remplace l''affichage i18n quand présent.';

CREATE INDEX IF NOT EXISTS legal_page_contents_slug_idx
  ON public.legal_page_contents (slug);

ALTER TABLE public.legal_page_contents ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_legal_page_editor()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT COALESCE(
    NULLIF(trim(auth.jwt() -> 'app_metadata' ->> 'role_id'), '')::integer,
    0
  ) IN (1, 8);
$$;

COMMENT ON FUNCTION public.is_legal_page_editor() IS
  'True si JWT app_metadata.role_id = 1 (admin général) ou 8 (juriste).';

REVOKE ALL ON FUNCTION public.is_legal_page_editor() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_legal_page_editor() TO authenticated;

DROP POLICY IF EXISTS legal_page_contents_select_public ON public.legal_page_contents;
CREATE POLICY legal_page_contents_select_public
  ON public.legal_page_contents
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS legal_page_contents_insert_editors ON public.legal_page_contents;
CREATE POLICY legal_page_contents_insert_editors
  ON public.legal_page_contents
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_legal_page_editor());

DROP POLICY IF EXISTS legal_page_contents_update_editors ON public.legal_page_contents;
CREATE POLICY legal_page_contents_update_editors
  ON public.legal_page_contents
  FOR UPDATE
  TO authenticated
  USING (public.is_legal_page_editor())
  WITH CHECK (public.is_legal_page_editor());

DROP POLICY IF EXISTS legal_page_contents_delete_editors ON public.legal_page_contents;
CREATE POLICY legal_page_contents_delete_editors
  ON public.legal_page_contents
  FOR DELETE
  TO authenticated
  USING (public.is_legal_page_editor());

GRANT SELECT ON TABLE public.legal_page_contents TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.legal_page_contents TO authenticated;
