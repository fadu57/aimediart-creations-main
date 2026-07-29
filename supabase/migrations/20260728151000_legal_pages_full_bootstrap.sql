-- =============================================================================
-- Script complet (idempotent) : pages légales éditables + juriste + commentaires
-- Supabase → SQL Editor → coller → Run
-- =============================================================================

INSERT INTO public.roles_user (role_id, label, role_name, role_name_clair)
VALUES (8, 'Juriste', 'juriste', 'Juriste')
ON CONFLICT (role_id) DO UPDATE
SET
  label = EXCLUDED.label,
  role_name = EXCLUDED.role_name,
  role_name_clair = EXCLUDED.role_name_clair;

CREATE TABLE IF NOT EXISTS public.legal_page_contents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL,
  locale text NOT NULL DEFAULT 'fr',
  body_html text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  CONSTRAINT legal_page_contents_slug_chk CHECK (slug ~ '^[a-z0-9_]+$'),
  CONSTRAINT legal_page_contents_locale_chk CHECK (char_length(locale) BETWEEN 2 AND 8)
);

ALTER TABLE public.legal_page_contents
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft';

ALTER TABLE public.legal_page_contents
  DROP CONSTRAINT IF EXISTS legal_page_contents_status_chk;

ALTER TABLE public.legal_page_contents
  ADD CONSTRAINT legal_page_contents_status_chk
  CHECK (status IN ('draft', 'published'));

ALTER TABLE public.legal_page_contents
  DROP CONSTRAINT IF EXISTS legal_page_contents_slug_locale_key;

DROP INDEX IF EXISTS legal_page_contents_slug_locale_status_uidx;

ALTER TABLE public.legal_page_contents
  DROP CONSTRAINT IF EXISTS legal_page_contents_slug_locale_status_key;

ALTER TABLE public.legal_page_contents
  ADD CONSTRAINT legal_page_contents_slug_locale_status_key UNIQUE (slug, locale, status);

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

REVOKE ALL ON FUNCTION public.is_legal_page_editor() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_legal_page_editor() TO authenticated;

DROP POLICY IF EXISTS legal_page_contents_select_public ON public.legal_page_contents;
CREATE POLICY legal_page_contents_select_public
  ON public.legal_page_contents
  FOR SELECT
  TO anon, authenticated
  USING (
    status = 'published'
    OR public.is_legal_page_editor()
  );

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

CREATE TABLE IF NOT EXISTS public.legal_page_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id uuid NOT NULL REFERENCES public.legal_page_contents (id) ON DELETE CASCADE,
  mark_id text NOT NULL,
  quote_text text NOT NULL DEFAULT '',
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  CONSTRAINT legal_page_comments_mark_id_chk CHECK (char_length(mark_id) BETWEEN 8 AND 64),
  CONSTRAINT legal_page_comments_body_chk CHECK (char_length(trim(body)) > 0),
  CONSTRAINT legal_page_comments_content_mark_key UNIQUE (content_id, mark_id)
);

CREATE INDEX IF NOT EXISTS legal_page_comments_content_id_idx
  ON public.legal_page_comments (content_id);

ALTER TABLE public.legal_page_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS legal_page_comments_select_editors ON public.legal_page_comments;
CREATE POLICY legal_page_comments_select_editors
  ON public.legal_page_comments
  FOR SELECT
  TO authenticated
  USING (public.is_legal_page_editor());

DROP POLICY IF EXISTS legal_page_comments_insert_editors ON public.legal_page_comments;
CREATE POLICY legal_page_comments_insert_editors
  ON public.legal_page_comments
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_legal_page_editor());

DROP POLICY IF EXISTS legal_page_comments_update_editors ON public.legal_page_comments;
CREATE POLICY legal_page_comments_update_editors
  ON public.legal_page_comments
  FOR UPDATE
  TO authenticated
  USING (public.is_legal_page_editor())
  WITH CHECK (public.is_legal_page_editor());

DROP POLICY IF EXISTS legal_page_comments_delete_editors ON public.legal_page_comments;
CREATE POLICY legal_page_comments_delete_editors
  ON public.legal_page_comments
  FOR DELETE
  TO authenticated
  USING (public.is_legal_page_editor());

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.legal_page_comments TO authenticated;

NOTIFY pgrst, 'reload schema';

SELECT to_regclass('public.legal_page_contents') AS legal_page_contents,
       to_regclass('public.legal_page_comments') AS legal_page_comments;
