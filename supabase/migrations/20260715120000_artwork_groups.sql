-- Regroupements d'œuvres par expo (artiste ou thème) — QR unique par groupe

BEGIN;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.artwork_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expo_id uuid NOT NULL REFERENCES public.expos (id) ON DELETE CASCADE,
  agency_id uuid NOT NULL REFERENCES public.agencies (id) ON DELETE CASCADE,
  group_type text NOT NULL CHECK (group_type IN ('artist', 'theme')),
  group_label text NOT NULL,
  group_display_number text NULL,
  group_artist_id uuid NULL REFERENCES public.artists (artist_id) ON DELETE SET NULL,
  group_qr_code_url text NULL,
  group_qrcode_image text NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.artwork_groups IS
  'Regroupement d''œuvres d''une expo (artiste ou thème) avec QR unique.';

CREATE TABLE IF NOT EXISTS public.artwork_group_members (
  group_id uuid NOT NULL REFERENCES public.artwork_groups (id) ON DELETE CASCADE,
  artwork_id uuid NOT NULL REFERENCES public.artworks (artwork_id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  PRIMARY KEY (group_id, artwork_id),
  CONSTRAINT artwork_group_members_artwork_unique UNIQUE (artwork_id)
);

COMMENT ON TABLE public.artwork_group_members IS
  'Membres ordonnés d''un regroupement d''œuvres (une œuvre = un seul groupe).';

CREATE INDEX IF NOT EXISTS idx_artwork_groups_expo_id
  ON public.artwork_groups (expo_id);

CREATE INDEX IF NOT EXISTS idx_artwork_groups_agency_id
  ON public.artwork_groups (agency_id);

CREATE INDEX IF NOT EXISTS idx_artwork_group_members_group_sort
  ON public.artwork_group_members (group_id, sort_order);

-- ---------------------------------------------------------------------------
-- Trigger updated_at
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_artwork_groups_set_updated_at ON public.artwork_groups;

CREATE TRIGGER trg_artwork_groups_set_updated_at
  BEFORE UPDATE ON public.artwork_groups
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Helper : groupe visible visiteur (toutes œuvres actives, non supprimées)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.artwork_group_is_visitor_visible(p_group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.artwork_group_members agm
    INNER JOIN public.artworks aw ON aw.artwork_id = agm.artwork_id
    WHERE agm.group_id = p_group_id
      AND aw.artwork_deleted_at IS NULL
      AND COALESCE(aw.deleted_at, aw.artwork_deleted_at) IS NULL
      AND lower(trim(COALESCE(aw.artwork_status, ''))) = 'active'
  );
$$;

COMMENT ON FUNCTION public.artwork_group_is_visitor_visible(uuid) IS
  'True si le groupe a au moins une œuvre active non supprimée.';

REVOKE ALL ON FUNCTION public.artwork_group_is_visitor_visible(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.artwork_group_is_visitor_visible(uuid) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.artwork_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.artwork_group_members ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON TABLE public.artwork_groups TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.artwork_groups TO authenticated;
GRANT SELECT ON TABLE public.artwork_group_members TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.artwork_group_members TO authenticated;

-- artwork_groups — lecture anon (parcours visiteur)
DROP POLICY IF EXISTS artwork_groups_anon_select_visible ON public.artwork_groups;
CREATE POLICY artwork_groups_anon_select_visible
  ON public.artwork_groups
  FOR SELECT
  TO anon
  USING (public.artwork_group_is_visitor_visible(id));

-- artwork_groups — lecture authenticated
DROP POLICY IF EXISTS artwork_groups_select_authenticated ON public.artwork_groups;
CREATE POLICY artwork_groups_select_authenticated
  ON public.artwork_groups
  FOR SELECT
  TO authenticated
  USING (
    public.rls_is_global_admin()
    OR public.rls_is_agency_staff_for(agency_id)
  );

-- artwork_groups — écriture authenticated
DROP POLICY IF EXISTS artwork_groups_write_authenticated ON public.artwork_groups;
CREATE POLICY artwork_groups_write_authenticated
  ON public.artwork_groups
  FOR ALL
  TO authenticated
  USING (
    public.rls_is_global_admin()
    OR public.rls_is_agency_staff_for(agency_id)
  )
  WITH CHECK (
    public.rls_is_global_admin()
    OR public.rls_is_agency_staff_for(agency_id)
  );

-- artwork_group_members — lecture anon
DROP POLICY IF EXISTS artwork_group_members_anon_select ON public.artwork_group_members;
CREATE POLICY artwork_group_members_anon_select
  ON public.artwork_group_members
  FOR SELECT
  TO anon
  USING (
    public.artwork_group_is_visitor_visible(group_id)
    AND EXISTS (
      SELECT 1
      FROM public.artworks aw
      WHERE aw.artwork_id = artwork_group_members.artwork_id
        AND aw.artwork_deleted_at IS NULL
        AND COALESCE(aw.deleted_at, aw.artwork_deleted_at) IS NULL
        AND lower(trim(COALESCE(aw.artwork_status, ''))) = 'active'
    )
  );

-- artwork_group_members — lecture authenticated
DROP POLICY IF EXISTS artwork_group_members_select_authenticated ON public.artwork_group_members;
CREATE POLICY artwork_group_members_select_authenticated
  ON public.artwork_group_members
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.artwork_groups ag
      WHERE ag.id = artwork_group_members.group_id
        AND (
          public.rls_is_global_admin()
          OR public.rls_is_agency_staff_for(ag.agency_id)
        )
    )
  );

-- artwork_group_members — écriture authenticated
DROP POLICY IF EXISTS artwork_group_members_write_authenticated ON public.artwork_group_members;
CREATE POLICY artwork_group_members_write_authenticated
  ON public.artwork_group_members
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.artwork_groups ag
      WHERE ag.id = artwork_group_members.group_id
        AND (
          public.rls_is_global_admin()
          OR public.rls_is_agency_staff_for(ag.agency_id)
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.artwork_groups ag
      WHERE ag.id = artwork_group_members.group_id
        AND (
          public.rls_is_global_admin()
          OR public.rls_is_agency_staff_for(ag.agency_id)
        )
    )
  );

COMMIT;
