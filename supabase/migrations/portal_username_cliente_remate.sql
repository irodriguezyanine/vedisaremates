-- Campo de nombre de usuario histórico (Rainworx/Rainworks) y RPC para carga masiva.

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS username TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_unique_idx
ON public.profiles (lower(username))
WHERE username IS NOT NULL AND btrim(username) <> '';

CREATE OR REPLACE FUNCTION public.portal_admin_set_username_by_email(
  p_email TEXT,
  p_username TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
  v_username TEXT := NULLIF(trim(COALESCE(p_username, '')), '');
BEGIN
  IF NOT public.auth_user_es_admin_o_sac() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sin_permiso');
  END IF;

  IF v_username IS NULL THEN
    RETURN jsonb_build_object('ok', true);
  END IF;

  IF v_username !~ '^[A-Za-z0-9_-]+$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'username_invalido');
  END IF;

  SELECT u.id
    INTO v_uid
  FROM auth.users u
  WHERE lower(u.email) = lower(trim(p_email))
  LIMIT 1;

  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'usuario_no_encontrado');
  END IF;

  BEGIN
    UPDATE public.profiles
    SET username = v_username
    WHERE id = v_uid;
  EXCEPTION
    WHEN unique_violation THEN
      RETURN jsonb_build_object('ok', false, 'error', 'username_duplicado');
  END;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'perfil_no_encontrado');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.portal_admin_set_username_by_email(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portal_admin_set_username_by_email(TEXT, TEXT) TO authenticated;

COMMENT ON COLUMN public.profiles.username IS 'Nombre de usuario histórico (ej. Rainworx/Rainworks), único por plataforma.';
COMMENT ON FUNCTION public.portal_admin_set_username_by_email(TEXT, TEXT) IS 'Admin/SAC: actualiza username de perfil por email existente.';
