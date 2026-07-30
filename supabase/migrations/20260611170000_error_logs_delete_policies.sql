-- Suppression des journaux d'erreurs par admins globaux (cascade vers logs)

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
