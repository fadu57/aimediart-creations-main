-- =============================================================
-- Migration : table sponsors + bucket Storage + RLS
-- À exécuter dans l'éditeur SQL de Supabase (une seule fois)
-- =============================================================

-- ── 1. Table sponsors ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sponsors (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  id_expo         uuid        NOT NULL REFERENCES public.expos(id) ON DELETE CASCADE,
  nom_expo        text,                         -- dénormalisé pour affichage rapide
  nom_sponsor     text        NOT NULL,
  contact_sponsor text,
  mail_sponsor    text,
  tel_sponsor     text,
  adresse_sponsor text,
  zipcode_sponsor text,
  city_sponsor    text,
  url_logo_sponsor text,
  descrip_sponsor text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sponsors_id_expo ON public.sponsors (id_expo);

-- ── 2. RLS ───────────────────────────────────────────────────
ALTER TABLE public.sponsors ENABLE ROW LEVEL SECURITY;

-- Lecture : membres de l'agence propriétaire de l'exposition
CREATE POLICY "sponsors_select_agency" ON public.sponsors
  FOR SELECT
  USING (
    id_expo IN (
      SELECT e.id
      FROM   public.expos e
      JOIN   public.agency_users au ON au.agency_id = e.agency_id
      WHERE  au.user_id = auth.uid()
    )
  );

-- Écriture (INSERT / UPDATE / DELETE) : mêmes membres
CREATE POLICY "sponsors_write_agency" ON public.sponsors
  FOR ALL
  USING (
    id_expo IN (
      SELECT e.id
      FROM   public.expos e
      JOIN   public.agency_users au ON au.agency_id = e.agency_id
      WHERE  au.user_id = auth.uid()
    )
  )
  WITH CHECK (
    id_expo IN (
      SELECT e.id
      FROM   public.expos e
      JOIN   public.agency_users au ON au.agency_id = e.agency_id
      WHERE  au.user_id = auth.uid()
    )
  );

-- ── 3. Bucket Storage "sponsors" ─────────────────────────────
-- Logos publiquement lisibles, écriture réservée aux utilisateurs authentifiés.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'sponsors',
  'sponsors',
  true,
  2097152,   -- 2 Mo max par fichier
  ARRAY['image/png','image/jpeg','image/webp','image/svg+xml']
)
ON CONFLICT (id) DO NOTHING;

-- Lecture publique (logos affichables côté visiteur)
CREATE POLICY "sponsors_logo_public_read" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'sponsors');

-- Upload / mise à jour pour les utilisateurs authentifiés
CREATE POLICY "sponsors_logo_auth_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'sponsors');

CREATE POLICY "sponsors_logo_auth_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'sponsors');

-- Suppression pour les utilisateurs authentifiés
CREATE POLICY "sponsors_logo_auth_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'sponsors');
