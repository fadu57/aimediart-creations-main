-- migration_43_expo_horaires.sql
-- Ajout d'une colonne JSONB pour les horaires d'ouverture par jour de la semaine.
--
-- Structure JSON attendue :
-- {
--   "lundi":    { "debut": "09:00", "fin": "18:00", "ferme": false },
--   "mardi":    { "debut": "09:00", "fin": "18:00", "ferme": false },
--   "mercredi": { "debut": null,    "fin": null,    "ferme": true  },
--   "jeudi":    { "debut": "14:00", "fin": "20:00", "ferme": false },
--   "vendredi": { "debut": "09:00", "fin": "18:00", "ferme": false },
--   "samedi":   { "debut": "10:00", "fin": "20:00", "ferme": false },
--   "dimanche": { "debut": null,    "fin": null,    "ferme": true  }
-- }
-- Chaque jour peut être omis (= non renseigné) ou avoir "ferme": true.

ALTER TABLE public.expos
  ADD COLUMN IF NOT EXISTS expo_horaires jsonb NULL;

COMMENT ON COLUMN public.expos.expo_horaires IS
  'Horaires d''ouverture par jour : objet JSON avec les clés lundi…dimanche, chacun contenant {debut, fin, ferme}.';

-- RLS : les politiques existantes sur expos couvrent déjà cette colonne (pas de politique dédiée requise).
