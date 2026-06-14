-- Recharge le cache schéma PostgREST après ajout de last_activity_at
NOTIFY pgrst, 'reload schema';
