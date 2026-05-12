-- Persistencia de ofertas al cierre + selección manual de oferta ganadora por lote.
-- Objetivos:
-- 1) No eliminar remates cerrados al sincronizar desde Tasaciones.
-- 2) Permitir seleccionar explícitamente una oferta ganadora en REMATE.
-- 3) Exponer la marca de "ganadora" en paneles admin e historial del cliente.

ALTER TABLE public.portal_remate_lotes
ADD COLUMN IF NOT EXISTS oferta_ganadora_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'portal_remate_lotes_oferta_ganadora_fkey'
      AND conrelid = 'public.portal_remate_lotes'::regclass
  ) THEN
    ALTER TABLE public.portal_remate_lotes
    ADD CONSTRAINT portal_remate_lotes_oferta_ganadora_fkey
    FOREIGN KEY (oferta_ganadora_id)
    REFERENCES public.portal_ofertas(id)
    ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_portal_lotes_oferta_ganadora
  ON public.portal_remate_lotes (oferta_ganadora_id)
  WHERE oferta_ganadora_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.portal_validar_oferta_ganadora_lote()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lote_oferta UUID;
BEGIN
  IF NEW.oferta_ganadora_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT o.lote_id
    INTO v_lote_oferta
  FROM public.portal_ofertas o
  WHERE o.id = NEW.oferta_ganadora_id
  LIMIT 1;

  IF v_lote_oferta IS NULL THEN
    RAISE EXCEPTION 'oferta_no_existe';
  END IF;

  IF v_lote_oferta <> NEW.id THEN
    RAISE EXCEPTION 'oferta_no_pertenece_al_lote';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS portal_validar_oferta_ganadora_lote_tg ON public.portal_remate_lotes;
CREATE TRIGGER portal_validar_oferta_ganadora_lote_tg
BEFORE INSERT OR UPDATE OF oferta_ganadora_id
ON public.portal_remate_lotes
FOR EACH ROW
EXECUTE FUNCTION public.portal_validar_oferta_ganadora_lote();

CREATE OR REPLACE FUNCTION public.portal_admin_set_oferta_ganadora(
  p_lote_id UUID,
  p_oferta_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lote public.portal_remate_lotes%ROWTYPE;
  v_oferta public.portal_ofertas%ROWTYPE;
BEGIN
  IF NOT public.auth_user_es_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sin_permiso');
  END IF;

  SELECT *
    INTO v_lote
  FROM public.portal_remate_lotes
  WHERE id = p_lote_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'lote_no_existe');
  END IF;

  IF p_oferta_id IS NULL THEN
    UPDATE public.portal_remate_lotes
    SET oferta_ganadora_id = NULL
    WHERE id = p_lote_id;

    INSERT INTO public.portal_lote_eventos (remate_id, lote_id, event_type, detalle, created_by)
    VALUES (
      v_lote.remate_id,
      v_lote.id,
      'oferta_ganadora_limpiada',
      jsonb_build_object('oferta_id', NULL),
      auth.uid()
    );

    RETURN jsonb_build_object('ok', true, 'oferta_ganadora_id', NULL);
  END IF;

  SELECT *
    INTO v_oferta
  FROM public.portal_ofertas
  WHERE id = p_oferta_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'oferta_no_existe');
  END IF;

  IF v_oferta.lote_id <> p_lote_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'oferta_no_pertenece_al_lote');
  END IF;

  UPDATE public.portal_remate_lotes
  SET
    oferta_ganadora_id = p_oferta_id,
    estado = CASE
      WHEN estado IN ('vendido', 'anulado') THEN estado
      ELSE 'adjudicado'
    END
  WHERE id = p_lote_id;

  INSERT INTO public.portal_lote_eventos (remate_id, lote_id, event_type, detalle, created_by)
  VALUES (
    v_lote.remate_id,
    v_lote.id,
    'oferta_ganadora_asignada',
    jsonb_build_object(
      'oferta_id', v_oferta.id,
      'user_id', v_oferta.user_id,
      'monto', v_oferta.monto
    ),
    auth.uid()
  );

  RETURN jsonb_build_object('ok', true, 'oferta_ganadora_id', p_oferta_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.portal_admin_set_oferta_ganadora(UUID, UUID) TO authenticated;

DROP FUNCTION IF EXISTS public.portal_admin_listar_ofertas_remate(UUID, INT);
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
  motivo_sospecha TEXT,
  es_ganadora BOOLEAN
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
    a.suspicious_reason::text AS motivo_sospecha,
    COALESCE(l.oferta_ganadora_id = o.id, false)::boolean AS es_ganadora
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

DROP FUNCTION IF EXISTS public.portal_admin_feed_ofertas_global(INT);
CREATE OR REPLACE FUNCTION public.portal_admin_feed_ofertas_global(p_limit INT DEFAULT 500)
RETURNS TABLE (
  oferta_id UUID,
  fecha TIMESTAMPTZ,
  remate_id UUID,
  remate_titulo TEXT,
  lote_id UUID,
  lote_titulo TEXT,
  monto NUMERIC,
  cliente_nombre TEXT,
  cliente_usuario TEXT,
  cliente_email TEXT,
  es_auto BOOLEAN,
  sospechosa BOOLEAN,
  motivo_sospecha TEXT,
  es_ganadora BOOLEAN
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
    r.id::uuid AS remate_id,
    r.titulo::text AS remate_titulo,
    l.id::uuid AS lote_id,
    COALESCE(NULLIF(trim(l.titulo), ''), 'Lote')::text AS lote_titulo,
    o.monto::numeric AS monto,
    COALESCE(NULLIF(trim(p.nombre), ''), 'Sin nombre')::text AS cliente_nombre,
    LEFT(o.user_id::text, 8)::text AS cliente_usuario,
    COALESCE(u.email, 'sin-email')::text AS cliente_email,
    COALESCE(a.is_auto_bid, false)::boolean AS es_auto,
    COALESCE(a.suspicious, false)::boolean AS sospechosa,
    a.suspicious_reason::text AS motivo_sospecha,
    COALESCE(l.oferta_ganadora_id = o.id, false)::boolean AS es_ganadora
  FROM public.portal_ofertas o
  JOIN public.portal_remate_lotes l ON l.id = o.lote_id
  JOIN public.portal_remates r ON r.id = l.remate_id
  JOIN auth.users u ON u.id = o.user_id
  LEFT JOIN public.profiles p ON p.id = o.user_id
  LEFT JOIN public.portal_ofertas_audit a ON a.oferta_id = o.id
  ORDER BY o.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 500), 5000));
END;
$$;

GRANT EXECUTE ON FUNCTION public.portal_admin_feed_ofertas_global(INT) TO authenticated;

DROP FUNCTION IF EXISTS public.portal_listar_mis_ofertas();
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
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_tie_mode TEXT := 'earliest';
BEGIN
  IF to_regclass('public.portal_remates_config') IS NOT NULL THEN
    BEGIN
      SELECT COALESCE(tie_breaker_mode, 'earliest')
      INTO v_tie_mode
      FROM public.portal_remates_config
      WHERE id = 1
      LIMIT 1;
    EXCEPTION
      WHEN undefined_table THEN
        v_tie_mode := 'earliest';
    END;
  END IF;

  IF v_tie_mode = 'latest' THEN
    RETURN QUERY
    WITH ganador_por_lote AS (
      SELECT DISTINCT ON (o.lote_id)
        o.lote_id,
        o.user_id AS winner_user_id
      FROM public.portal_ofertas o
      ORDER BY o.lote_id, o.monto DESC, o.created_at DESC
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
        WHEN l.oferta_ganadora_id IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM public.portal_ofertas og
            WHERE og.id = l.oferta_ganadora_id
              AND og.user_id = auth.uid()
          ) THEN 'ganado'
        WHEN l.oferta_ganadora_id IS NOT NULL THEN 'no_ganado'
        WHEN g.winner_user_id = auth.uid() THEN 'ganado'
        ELSE 'no_ganado'
      END AS resultado
    FROM public.portal_ofertas o
    JOIN public.portal_remate_lotes l ON l.id = o.lote_id
    JOIN public.portal_remates r ON r.id = l.remate_id
    LEFT JOIN ganador_por_lote g ON g.lote_id = l.id
    WHERE o.user_id = auth.uid()
    ORDER BY o.created_at DESC;
  ELSE
    RETURN QUERY
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
        WHEN l.oferta_ganadora_id IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM public.portal_ofertas og
            WHERE og.id = l.oferta_ganadora_id
              AND og.user_id = auth.uid()
          ) THEN 'ganado'
        WHEN l.oferta_ganadora_id IS NOT NULL THEN 'no_ganado'
        WHEN g.winner_user_id = auth.uid() THEN 'ganado'
        ELSE 'no_ganado'
      END AS resultado
    FROM public.portal_ofertas o
    JOIN public.portal_remate_lotes l ON l.id = o.lote_id
    JOIN public.portal_remates r ON r.id = l.remate_id
    LEFT JOIN ganador_por_lote g ON g.lote_id = l.id
    WHERE o.user_id = auth.uid()
    ORDER BY o.created_at DESC;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.portal_listar_mis_ofertas() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portal_listar_mis_ofertas() TO authenticated;

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

COMMENT ON FUNCTION public.portal_admin_set_oferta_ganadora(UUID, UUID) IS 'Admin/SAC: asigna o limpia la oferta ganadora de un lote.';
