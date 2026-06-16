-- migration_09_artworks_fingerprint_jsonb.sql — ARCHIVE
--
-- L’historique du dépôt contenait ici une migration touchant une ancienne colonne
-- texte/json de description désormais supprimée. Le schéma actuel stocke la médiation
-- uniquement dans `artwork_description_i18n` (jsonb).
--
-- Ne pas exécuter ce fichier sur une base déjà à jour : à conserver pour traçabilité.
-- Ajoutez plutôt `artwork_fingerprint` / `artwork_source_material` via une migration
-- Supabase adaptée à votre projet si besoin.

SELECT 1;
