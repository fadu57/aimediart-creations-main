-- Migration : suppression des journaux d'erreurs par les admins globaux (role_id 1-3)
-- La suppression d'une session cascade vers ses logs (ON DELETE CASCADE).

DROP POLICY IF EXISTS organizer_error_sessions_delete_admin ON public.organizer_error_sessions;
CREATE POLICY organizer_error_sessions_delete_admin
  ON public.organizer_error_sessions
  FOR DELETE
  TO authenticated
  USING (public.rls_is_global_admin());

DROP POLICY IF EXISTS visitor_error_sessions_delete_admin ON public.visitor_error_sessions;
CREATE POLICY visitor_error_sessions_delete_admin
  ON public.visitor_error_sessions
  FOR DELETE
  TO authenticated
  USING (public.rls_is_global_admin());

GRANT DELETE ON public.organizer_error_sessions TO authenticated;
GRANT DELETE ON public.visitor_error_sessions TO authenticated;
