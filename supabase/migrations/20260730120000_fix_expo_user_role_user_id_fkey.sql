-- AIM-23 : expo_user_role_user_id_fkey référence public.users_legacy(id), une table
-- orpheline (0 ligne, non peuplée, non référencée ailleurs dans le schéma). Or tout le
-- code applicatif (register-visitor-instant, admin-create-user) insère l'id auth.users
-- (auth.admin.createUser().id) dans expo_user_role.user_id — comme profiles.id et
-- agency_users.user_id, qui référencent déjà auth.users(id). La policy RLS
-- expo_user_role_select (user_id = auth.uid()) confirme le même espace d'id attendu.
-- Résultat : toute insertion viole la FK à coup sûr (violation de clé étrangère
-- expo_user_role_user_id_fkey, VIS-REG-02).
--
-- Avant ce correctif, l'insertion échouait systématiquement : aucun doublon
-- (expo_id, user_id) n'a jamais pu exister. Le correctif lève ce blocage et
-- rend les doublons possibles (retry front, reconciliation) — on ajoute donc
-- l'unicité dans le même changement pour ne pas ouvrir cette régression.
SET lock_timeout = '5s';

ALTER TABLE "public"."expo_user_role"
    DROP CONSTRAINT IF EXISTS "expo_user_role_user_id_fkey";

ALTER TABLE "public"."expo_user_role"
    ADD CONSTRAINT "expo_user_role_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;

ALTER TABLE "public"."expo_user_role"
    ADD CONSTRAINT "expo_user_role_expo_user_uniq" UNIQUE ("expo_id", "user_id");
