-- Ajustes finales de integracion Tasaciones -> Portal:
-- 1) Importar solo remates no historicos (futuros o en curso).
-- 2) Corregir RPC admin de ofertas para evitar
--    "structure of query does not match function result type".

CREATE OR REPLACE FUNCTION public.portal_integracion_sync_remate(p_tasaciones_remate_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_r RECORD;
  v_duration_hours INT := 24;
  v_starts_at TIMESTAMPTZ;
  v_ends_at TIMESTAMPTZ;
  v_estado_portal TEXT;
  v_titulo TEXT;
  v_portal_remate_id UUID;
  v_estado_tasaciones TEXT;
BEGIN
  SELECT remate_duration_hours
    INTO v_duration_hours
  FROM public.portal_integracion_config
  WHERE id = 1;

  SELECT
    r.id,
    r.numero_remate,
    r.descripcion,
    r.fecha_hora_remate,
    r.estado
  INTO v_r
  FROM public.remates r
  WHERE r.id = p_tasaciones_remate_id
  LIMIT 1;

  IF v_r.id IS NULL THEN
    DELETE FROM public.portal_remates
    WHERE tasaciones_remate_id = p_tasaciones_remate_id;
    RETURN NULL;
  END IF;

  v_ends_at := v_r.fecha_hora_remate;
  v_estado_tasaciones := lower(COALESCE(trim(v_r.estado), ''));

  -- Regla solicitada: no importar remates historicos/cerrados.
  IF v_ends_at <= timezone('utc'::text, now()) OR v_estado_tasaciones = 'cerrado' THEN
    DELETE FROM public.portal_remates
    WHERE tasaciones_remate_id = p_tasaciones_remate_id;
    RETURN NULL;
  END IF;

  v_starts_at := v_ends_at - make_interval(hours => COALESCE(v_duration_hours, 24));
  v_estado_portal := public.portal_integracion_estado_remate(v_starts_at, v_ends_at, v_r.estado);
  v_titulo := trim(
    concat_ws(
      ' - ',
      NULLIF(trim(COALESCE(v_r.numero_remate, '')), ''),
      NULLIF(trim(COALESCE(v_r.descripcion, '')), '')
    )
  );
  IF v_titulo = '' THEN
    v_titulo := COALESCE(v_r.numero_remate, 'Remate');
  END IF;

  INSERT INTO public.portal_remates (
    titulo,
    descripcion,
    estado,
    starts_at,
    ends_at,
    source_system,
    tasaciones_remate_id,
    source_event_number
  )
  VALUES (
    v_titulo,
    NULLIF(trim(COALESCE(v_r.descripcion, '')), ''),
    v_estado_portal,
    v_starts_at,
    v_ends_at,
    'tasaciones',
    v_r.id,
    v_r.numero_remate
  )
  ON CONFLICT (tasaciones_remate_id)
  DO UPDATE SET
    titulo = EXCLUDED.titulo,
    descripcion = EXCLUDED.descripcion,
    estado = EXCLUDED.estado,
    starts_at = EXCLUDED.starts_at,
    ends_at = EXCLUDED.ends_at,
    source_system = EXCLUDED.source_system,
    source_event_number = EXCLUDED.source_event_number,
    updated_at = timezone('utc'::text, now())
  RETURNING id INTO v_portal_remate_id;

  RETURN v_portal_remate_id;
END;
$$;

-- Limpieza inicial para dejar fuera historicos que ya se sincronizaron antes.
DELETE FROM public.portal_remates
WHERE source_system = 'tasaciones'
  AND ends_at <= timezone('utc'::text, now());

CREATE OR REPLACE FUNCTION public.portal_admin_listar_ofertas_remate(
  p_remate_id UUID,
  p_limit INT DEFAULT 1000
)
RETURNS TABLE (
  oferta_id UUID,
  fecha TIMESTAMPTZ,
  monto NUMERIC,
  lote_id UUID,
  lote_titulo TEXT,
  cliente_nombre TEXT,
  cliente_usuario TEXT,
  cliente_email TEXT,
  es_auto BOOLEAN,
  sospechosa BOOLEAN,
  motivo_sospecha TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.auth_user_es_admin() THEN
    RAISE EXCEPTION 'sin_permiso';
  END IF;

  RETURN QUERY
  SELECT
    o.id::uuid AS oferta_id,
    o.created_at::timestamptz AS fecha,
    o.monto::numeric AS monto,
    l.id::uuid AS lote_id,
    COALESCE(NULLIF(trim(l.titulo), ''), 'Lote')::text AS lote_titulo,
    COALESCE(NULLIF(trim(p.nombre), ''), 'Sin nombre')::text AS cliente_nombre,
    LEFT(o.user_id::text, 8)::text AS cliente_usuario,
    COALESCE(u.email, 'sin-email')::text AS cliente_email,
    COALESCE(a.is_auto_bid, false)::boolean AS es_auto,
    COALESCE(a.suspicious, false)::boolean AS sospechosa,
    a.suspicious_reason::text AS motivo_sospecha
  FROM public.portal_ofertas o
  JOIN public.portal_remate_lotes l ON l.id = o.lote_id
  JOIN auth.users u ON u.id = o.user_id
  LEFT JOIN public.profiles p ON p.id = o.user_id
  LEFT JOIN public.portal_ofertas_audit a ON a.oferta_id = o.id
  WHERE l.remate_id = p_remate_id
  ORDER BY o.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 1000), 10000));
END;
$$;

GRANT EXECUTE ON FUNCTION public.portal_admin_listar_ofertas_remate(UUID, INT) TO authenticated;
