-- Corrige les URLs selfie visiteur : …/photos/visitors/selfies/… → …/photos/visitors/…

UPDATE public.profiles
SET avatar_url = REPLACE(avatar_url, '/photos/visitors/selfies/', '/photos/visitors/')
WHERE avatar_url LIKE '%/photos/visitors/selfies/%';

UPDATE public.visitors
SET selfie_url = REPLACE(selfie_url, '/photos/visitors/selfies/', '/photos/visitors/')
WHERE selfie_url LIKE '%/photos/visitors/selfies/%';

UPDATE public.visitors
SET avatar_url = REPLACE(avatar_url, '/photos/visitors/selfies/', '/photos/visitors/')
WHERE avatar_url LIKE '%/photos/visitors/selfies/%';
