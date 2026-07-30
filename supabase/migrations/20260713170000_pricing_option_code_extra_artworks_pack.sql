-- Nouvelle option tarifaire : pack d'œuvres supplémentaires (enum séparé de l'INSERT)
ALTER TYPE public.pricing_option_code ADD VALUE IF NOT EXISTS 'EXTRA_ARTWORKS_PACK';
