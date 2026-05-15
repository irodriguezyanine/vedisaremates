-- Alinear permisos históricos: "admin" y "sac" deben comportarse igual
-- en políticas/funciones legacy que dependen de auth_user_es_admin().

CREATE OR REPLACE FUNCTION public.auth_user_es_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND lower(coalesce(p.rol, '')) IN ('admin', 'sac')
  );
$$;

COMMENT ON FUNCTION public.auth_user_es_admin()
IS 'Retorna true para perfiles con rol admin o sac.';

