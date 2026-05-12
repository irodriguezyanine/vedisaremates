-- Username: normalización automática y soporte de punto (.) para importación/edición.

CREATE OR REPLACE FUNCTION public.portal_normalize_username(p_username TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            trim(
              translate(
                COALESCE(p_username, ''),
                'ÁÀÄÂÃáàäâãÉÈËÊéèëêÍÌÏÎíìïîÓÒÖÔÕóòöôõÚÙÜÛúùüûÑñÇç',
                'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuNnCc'
              )
            ),
            '\s+',
            '_',
            'g'
          ),
          '[^A-Za-z0-9._-]+',
          '_',
          'g'
        ),
        '_+',
        '_',
        'g'
      ),
      '^[_\-.]+|[_\-.]+$',
      '',
      'g'
    ),
    ''
  );
$$;

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
  v_username TEXT := public.portal_normalize_username(p_username);
BEGIN
  IF NOT public.auth_user_es_admin_o_sac() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sin_permiso');
  END IF;

  IF v_username IS NULL THEN
    RETURN jsonb_build_object('ok', true);
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

DROP FUNCTION IF EXISTS public.portal_admin_update_usuario(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN);
CREATE OR REPLACE FUNCTION public.portal_admin_update_usuario(
  p_user_id UUID,
  p_email TEXT,
  p_username TEXT,
  p_nombre TEXT,
  p_apellido TEXT,
  p_rut TEXT,
  p_direccion TEXT,
  p_telefono TEXT,
  p_rol TEXT,
  p_must_change_password BOOLEAN DEFAULT NULL,
  p_garantia_aprobada BOOLEAN DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email TEXT := lower(trim(COALESCE(p_email, '')));
  v_username TEXT := public.portal_normalize_username(p_username);
  v_rol_raw TEXT := trim(COALESCE(p_rol, ''));
  v_rol TEXT;
  v_ref_table TEXT;
  v_ref_col TEXT;
BEGIN
  IF NOT public.auth_user_es_admin_o_sac() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sin_permiso');
  END IF;

  IF v_email = '' OR position('@' IN v_email) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'email_invalido');
  END IF;

  SELECT c.confrelid::regclass::text, a.attname
    INTO v_ref_table, v_ref_col
  FROM pg_constraint c
  JOIN pg_attribute a
    ON a.attrelid = c.confrelid
   AND a.attnum = c.confkey[1]
  WHERE c.conname = 'profiles_rol_fkey'
    AND c.conrelid = 'public.profiles'::regclass
  LIMIT 1;

  IF v_ref_table IS NULL OR v_ref_col IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'rol_fk_no_encontrada');
  END IF;

  EXECUTE format(
    'SELECT %1$I::text
       FROM %2$s
      WHERE lower(replace(replace(replace(%1$I::text, ''_'', ''''), ''-'', ''''), '' '', '''')) =
            lower(replace(replace(replace($1::text, ''_'', ''''), ''-'', ''''), '' '', ''''))
         OR regexp_replace(lower(replace(replace(replace(%1$I::text, ''_'', ''''), ''-'', ''''), '' '', '''')), ''s$'', '''') =
            regexp_replace(lower(replace(replace(replace($1::text, ''_'', ''''), ''-'', ''''), '' '', '''')), ''s$'', '''')
      LIMIT 1',
    v_ref_col,
    v_ref_table
  )
    INTO v_rol
  USING v_rol_raw;

  IF v_rol IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'rol_invalido');
  END IF;

  BEGIN
    UPDATE auth.users
    SET email = v_email
    WHERE id = p_user_id;
  EXCEPTION
    WHEN unique_violation THEN
      RETURN jsonb_build_object('ok', false, 'error', 'email_duplicado');
  END;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'usuario_no_encontrado');
  END IF;

  BEGIN
    UPDATE public.profiles
    SET
      username = v_username,
      nombre = NULLIF(trim(p_nombre), ''),
      apellido = NULLIF(trim(p_apellido), ''),
      rut = NULLIF(trim(p_rut), ''),
      direccion = NULLIF(trim(p_direccion), ''),
      telefono = NULLIF(trim(p_telefono), ''),
      rol = v_rol,
      must_change_password = COALESCE(p_must_change_password, must_change_password),
      garantia_aprobada = COALESCE(p_garantia_aprobada, garantia_aprobada),
      garantia_aprobada_at = CASE
        WHEN p_garantia_aprobada IS NULL THEN garantia_aprobada_at
        WHEN p_garantia_aprobada = true THEN timezone('utc'::text, now())
        ELSE NULL
      END,
      garantia_aprobada_by = CASE
        WHEN p_garantia_aprobada IS NULL THEN garantia_aprobada_by
        WHEN p_garantia_aprobada = true THEN auth.uid()
        ELSE NULL
      END
    WHERE id = p_user_id;
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

REVOKE ALL ON FUNCTION public.portal_normalize_username(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portal_normalize_username(TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.portal_admin_set_username_by_email(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portal_admin_set_username_by_email(TEXT, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.portal_admin_update_usuario(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portal_admin_update_usuario(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN) TO authenticated;
