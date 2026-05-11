-- Gestión extendida de usuarios del portal:
-- - Flag de cambio obligatorio de contraseña en primer ingreso.
-- - Funciones para marcar/limpiar el flag.
-- - Historial de ofertas del cliente-remate con resultado (ganado/no).

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS apellido TEXT;
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS rut TEXT;
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS direccion TEXT;
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS telefono TEXT;
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS avatar_url TEXT;

CREATE OR REPLACE FUNCTION public.portal_marcar_cambio_clave_por_email(
  p_email TEXT,
  p_requerido BOOLEAN DEFAULT true
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
BEGIN
  IF NOT public.auth_user_es_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sin_permiso');
  END IF;

  SELECT u.id
    INTO v_uid
  FROM auth.users u
  WHERE lower(u.email) = lower(trim(p_email))
  LIMIT 1;

  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'usuario_no_encontrado');
  END IF;

  UPDATE public.profiles
  SET must_change_password = COALESCE(p_requerido, true)
  WHERE id = v_uid;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.portal_marcar_cambio_clave_por_email(TEXT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portal_marcar_cambio_clave_por_email(TEXT, BOOLEAN) TO authenticated;

CREATE OR REPLACE FUNCTION public.portal_mi_cuenta_marcar_clave_actualizada()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sin_sesion');
  END IF;

  UPDATE public.profiles
  SET must_change_password = false
  WHERE id = auth.uid();

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.portal_mi_cuenta_marcar_clave_actualizada() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portal_mi_cuenta_marcar_clave_actualizada() TO authenticated;

CREATE OR REPLACE FUNCTION public.portal_update_mi_perfil(
  p_nombre TEXT,
  p_apellido TEXT,
  p_rut TEXT,
  p_direccion TEXT,
  p_telefono TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sin_sesion');
  END IF;

  UPDATE public.profiles
  SET
    nombre = NULLIF(trim(p_nombre), ''),
    apellido = NULLIF(trim(p_apellido), ''),
    rut = NULLIF(trim(p_rut), ''),
    direccion = NULLIF(trim(p_direccion), ''),
    telefono = NULLIF(trim(p_telefono), '')
  WHERE id = auth.uid();

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.portal_update_mi_perfil(TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portal_update_mi_perfil(TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.portal_update_mi_foto(p_avatar_url TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sin_sesion');
  END IF;

  UPDATE public.profiles
  SET avatar_url = NULLIF(trim(p_avatar_url), '')
  WHERE id = auth.uid();

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.portal_update_mi_foto(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portal_update_mi_foto(TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.portal_admin_set_user_role_by_email(
  p_email TEXT,
  p_rol TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
  v_rol TEXT := lower(trim(p_rol));
  v_rows INTEGER := 0;
BEGIN
  IF NOT public.auth_user_es_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sin_permiso');
  END IF;

  IF v_rol NOT IN ('cliente_remate', 'cliente_empresa', 'transportista', 'bodega', 'sac', 'admin', 'usuario') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'rol_invalido');
  END IF;

  SELECT u.id
    INTO v_uid
  FROM auth.users u
  WHERE lower(u.email) = lower(trim(p_email))
  LIMIT 1;

  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'usuario_no_encontrado');
  END IF;

  UPDATE public.profiles
  SET rol = v_rol
  WHERE id = v_uid;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'perfil_no_encontrado');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.portal_admin_set_user_role_by_email(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portal_admin_set_user_role_by_email(TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.portal_listar_mis_ofertas()
RETURNS TABLE (
  oferta_id UUID,
  created_at TIMESTAMPTZ,
  monto NUMERIC,
  lote_id UUID,
  lote_titulo TEXT,
  remate_id UUID,
  remate_titulo TEXT,
  remate_estado TEXT,
  resultado TEXT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  WITH ganador_por_lote AS (
    SELECT DISTINCT ON (o.lote_id)
      o.lote_id,
      o.user_id AS winner_user_id
    FROM public.portal_ofertas o
    ORDER BY o.lote_id, o.monto DESC, o.created_at ASC
  )
  SELECT
    o.id,
    o.created_at,
    o.monto,
    l.id,
    COALESCE(NULLIF(trim(l.titulo), ''), 'Lote'),
    r.id,
    r.titulo,
    r.estado,
    CASE
      WHEN r.estado <> 'cerrado' THEN 'pendiente'
      WHEN g.winner_user_id = auth.uid() THEN 'ganado'
      ELSE 'no_ganado'
    END AS resultado
  FROM public.portal_ofertas o
  JOIN public.portal_remate_lotes l ON l.id = o.lote_id
  JOIN public.portal_remates r ON r.id = l.remate_id
  LEFT JOIN ganador_por_lote g ON g.lote_id = l.id
  WHERE o.user_id = auth.uid()
  ORDER BY o.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.portal_listar_mis_ofertas() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portal_listar_mis_ofertas() TO authenticated;

COMMENT ON COLUMN public.profiles.must_change_password IS 'Indica si el usuario debe cambiar contraseña en su próximo inicio de sesión.';
COMMENT ON FUNCTION public.portal_marcar_cambio_clave_por_email(TEXT, BOOLEAN) IS 'Admin: marca por email si el usuario debe cambiar contraseña al iniciar sesión.';
COMMENT ON FUNCTION public.portal_mi_cuenta_marcar_clave_actualizada() IS 'Usuario autenticado: limpia flag de cambio de contraseña obligatorio.';
COMMENT ON FUNCTION public.portal_update_mi_perfil(TEXT, TEXT, TEXT, TEXT, TEXT) IS 'Usuario autenticado: actualiza su perfil personal (nombre, apellido, rut, direccion, telefono).';
COMMENT ON FUNCTION public.portal_update_mi_foto(TEXT) IS 'Usuario autenticado: guarda o limpia la URL de su foto de perfil.';
COMMENT ON FUNCTION public.portal_admin_set_user_role_by_email(TEXT, TEXT) IS 'Admin: fuerza rol en profiles para un usuario existente identificado por email.';
