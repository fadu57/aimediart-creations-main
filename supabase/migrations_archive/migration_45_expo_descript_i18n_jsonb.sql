-- Migration : aligner expo_descript_i18n sur le pattern existant de VisitorWelcome.tsx
-- Structure cible : {"fr":"...","en":"...","de":"...","es":"...","it":"..."}
-- Pas de clé source_lang (non présente dans le pattern existant).

-- 1. Convertir en jsonb si la colonne est encore de type text
ALTER TABLE public.expos
  ALTER COLUMN expo_descript_i18n TYPE jsonb
  USING CASE
    WHEN expo_descript_i18n IS NULL THEN NULL
    -- Déjà JSON valide → cast direct
    WHEN TRIM(expo_descript_i18n::text) LIKE '{%' THEN
      -- Retirer source_lang si présent (cleanup migration précédente)
      (expo_descript_i18n::text::jsonb - 'source_lang')
    -- Texte brut → encapsuler sous "fr" (langue par défaut)
    ELSE jsonb_build_object('fr', TRIM(expo_descript_i18n::text))
  END;

COMMENT ON COLUMN public.expos.expo_descript_i18n IS
  'Descriptif multilingue. Structure : {"fr":"...","en":"...","de":"...","es":"...","it":"..."}';
