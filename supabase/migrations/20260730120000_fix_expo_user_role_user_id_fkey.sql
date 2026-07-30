-- AIM-23 : expo_user_role_user_id_fkey référence public.users_legacy(id), une table
-- orpheline (0 ligne, non peuplée, non référencée ailleurs dans le schéma). Or tout le
-- code applicatif (register-visitor-instant, admin-create-user) insère l'id auth.users
-- (auth.admin.createUser().id) dans expo_user_role.user_id — comme profiles.id et
-- agency_users.user_id, qui référencent déjà auth.users(id). La policy RLS
-- expo_user_role_select (user_id = auth.uid()) confirme le même espace d'id attendu.
-- Résultat : toute insertion viole la FK à coup sûr (violation de clé étrangère
-- expo_user_role_user_id_fkey, VIS-REG-02).
--
-- Le correctif lève ce blocage et rend les doublons (expo_id, user_id) possibles
-- (retry front, reconciliation) — on ajoute donc l'unicité dans le même changement.
-- Une FK ne contrôle pas les valeurs NULL et ADD CONSTRAINT valide les lignes
-- existantes : on ne suppose pas que la table est "forcément propre", on le
-- vérifie explicitement ci-dessous et on échoue avec un message actionnable
-- plutôt que de laisser l'ALTER échouer avec une erreur générique.
BEGIN;

SET LOCAL lock_timeout = '5s';

DO $$
DECLARE
    orphan_count integer;
    dup_count integer;
BEGIN
    SELECT count(*) INTO orphan_count
    FROM public.expo_user_role e
    LEFT JOIN auth.users u ON u.id = e.user_id
    WHERE e.user_id IS NOT NULL AND u.id IS NULL;

    IF orphan_count > 0 THEN
        RAISE EXCEPTION
            'AIM-23 : % ligne(s) de expo_user_role ont un user_id absent de auth.users — nettoyer avant d''appliquer cette migration.',
            orphan_count;
    END IF;

    SELECT count(*) INTO dup_count
    FROM (
        SELECT expo_id, user_id
        FROM public.expo_user_role
        WHERE expo_id IS NOT NULL AND user_id IS NOT NULL
        GROUP BY expo_id, user_id
        HAVING count(*) > 1
    ) d;

    IF dup_count > 0 THEN
        RAISE EXCEPTION
            'AIM-23 : % doublon(s) (expo_id, user_id) dans expo_user_role — dédupliquer avant d''appliquer cette migration.',
            dup_count;
    END IF;
END $$;

ALTER TABLE "public"."expo_user_role"
    DROP CONSTRAINT IF EXISTS "expo_user_role_user_id_fkey";

ALTER TABLE "public"."expo_user_role"
    ADD CONSTRAINT "expo_user_role_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;

ALTER TABLE "public"."expo_user_role"
    DROP CONSTRAINT IF EXISTS "expo_user_role_expo_user_uniq";

ALTER TABLE "public"."expo_user_role"
    ADD CONSTRAINT "expo_user_role_expo_user_uniq" UNIQUE NULLS NOT DISTINCT ("expo_id", "user_id");

COMMIT;
