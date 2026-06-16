-- migration_12_app_settings_analysis_prompt.sql
-- Objectif: stocker le prompt d'analyse dans la BDD pour éviter les redéploiements.

BEGIN;

CREATE TABLE IF NOT EXISTS public.app_settings (
  key text PRIMARY KEY,
  value text NOT NULL
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Nettoyage policies éventuelles
DROP POLICY IF EXISTS "app_settings_admin_all" ON public.app_settings;
DROP POLICY IF EXISTS "app_settings_read_authenticated" ON public.app_settings;

-- Admin (role_id IN 1,2) : accès complet
CREATE POLICY "app_settings_admin_all"
ON public.app_settings
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role_id IN (1, 2)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role_id IN (1, 2)
  )
);

-- (Optionnel) Lecture authenticated (utile si tu veux afficher le prompt sans être admin)
-- Ici on laisse uniquement admin écrire/lire, mais on peut ouvrir la lecture si besoin.

INSERT INTO public.app_settings(key, value)
VALUES (
  'analysis_prompt',
  'Analyse l''image de façon factuelle, concise et structurée. Pas de préambule.
Artiste (si connu) : {{artist_name}}.

Format attendu (répondre en français, en listes courtes) :
- Sujet :
- Couleurs dominantes :
- Style artistique :
- Technique probable :
- Ambiance / émotion :

Contraintes :
- Ne commence pas par « En tant que… » ou une introduction.
- Ne fais pas d''hypothèses gratuites : si incertain, indique-le.'
)
ON CONFLICT (key) DO NOTHING;

COMMIT;

