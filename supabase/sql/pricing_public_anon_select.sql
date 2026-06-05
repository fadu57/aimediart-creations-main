-- Vitrine publique (/organisation#tarifs) : lecture des offres par anon + authenticated.
-- À exécuter sur le projet Supabase (SQL Editor).
-- Sans cette policy, le client reçoit 0 ligne → « Aucune offre trouvée » et les boutons Commander disparaissent.

ALTER TABLE public.pricing ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON TABLE public.pricing TO anon;
GRANT SELECT ON TABLE public.pricing TO authenticated;

DROP POLICY IF EXISTS "pricing_public_anon_select" ON public.pricing;

CREATE POLICY "pricing_public_anon_select"
ON public.pricing
FOR SELECT
TO anon, authenticated
USING (true);
