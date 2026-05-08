-- =====================================================================
-- Lectura completa de public.inventario para administradores del portal.
-- Ejecutá en el SQL Editor del proyecto Supabase de Vedisaremates (misma BD
-- que Tasaciones) si los usuarios admin solo veían filas filtradas o un
-- subconjunto de estados. Las políticas permisivas se combinan con OR.
-- Requiere: public.auth_user_es_admin()
-- =====================================================================

DROP POLICY IF EXISTS portal_inventario_admin_select_all ON public.inventario;
CREATE POLICY portal_inventario_admin_select_all
  ON public.inventario FOR SELECT
  TO authenticated
  USING (public.auth_user_es_admin());

COMMENT ON POLICY portal_inventario_admin_select_all ON public.inventario IS
  'Portal Vedisaremates: admin lee todo el inventario (todos los estados).';
