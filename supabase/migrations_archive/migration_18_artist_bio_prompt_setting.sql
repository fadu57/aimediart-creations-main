-- migration_18_artist_bio_prompt_setting.sql
-- Prompt dynamique de génération bio artiste dans app_settings.

BEGIN;

INSERT INTO public.app_settings(key, value)
VALUES (
  'artist_bio_prompt',
  'Tu es rédacteur culturel.
Rédige une biographie courte en français (4 à 6 phrases, maximum 550 caractères).
Artiste: {{prenom}} {{nom}}.
Type(s) d''art: {{art_types}}.
Contraintes:
- style clair, professionnel, fluide
- ne pas inventer de faits précis (dates, lieux, prix, expositions)
- si une information est inconnue, rester générique
- ne pas utiliser de liste à puces
Retourne uniquement le paragraphe final.'
)
ON CONFLICT (key) DO NOTHING;

COMMIT;

