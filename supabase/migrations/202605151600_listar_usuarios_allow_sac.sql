-- Asegura que SAC pueda listar usuarios en el panel admin
-- sin depender de políticas RLS heredadas de otros despliegues.

DROP FUNCTION IF EXISTS public.listar_usuarios();

CREATE OR REPLACE FUNCTION public.listar_usuarios()
RETURNS TABLE (
  id uuid,
  email text,
  nombre text,
  rol text,
  created_at timestamptz,
  must_change_password boolean,
  garantia_aprobada boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.auth_user_es_admin_o_sac() THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    NULLIF(trim(u.email), '') AS email,
    p.nombre,
    p.rol,
    p.created_at,
    p.must_change_password,
    p.garantia_aprobada
  FROM public.profiles p
  LEFT JOIN auth.users u ON u.id = p.id
  ORDER BY p.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.listar_usuarios() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.listar_usuarios() TO authenticated;

COMMENT ON FUNCTION public.listar_usuarios()
IS 'Lista usuarios para panel admin (admin/sac), incluyendo email desde auth.users.';

