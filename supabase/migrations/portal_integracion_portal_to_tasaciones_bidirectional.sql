-- Sincronizacion bidireccional: Portal Subastas -> tablas compartidas Tasaciones.
-- Objetivo: cualquier alta/edicion/baja en portal_remates / portal_remate_lotes
-- debe reflejarse en public.remates / public.remates_items / public.inventario.

ALTER TABLE public.remates
  ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'remate';

ALTER TABLE public.remates
  DROP CONSTRAINT IF EXISTS remates_tipo_check;

ALTER TABLE public.remates
  ADD CONSTRAINT remates_tipo_check
  CHECK (tipo IN ('remate', 'venta_directa'));

ALTER TABLE public.remates
  ADD COLUMN IF NOT EXISTS fecha_hora_inicio TIMESTAMPTZ;

ALTER TABLE public.remates
  ADD COLUMN IF NOT EXISTS fecha_hora_cierre TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.portal_integracion_es_venta_directa(p_texto TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    regexp_replace(
      lower(
        translate(coalesce(p_texto, ''), 'ÁÀÄÂáàäâÉÈËÊéèëêÍÌÏÎíìïîÓÒÖÔóòöôÚÙÜÛúùüûÑñ', 'AAAAaaaaEEEEeeeeIIIIiiiiOOOOooooUUUUuuuuNn')
      ),
      '[^a-z0-9]+',
      '',
      'g'
    ) ~ '(ventadirecta|vtadirecta|vtdirecta|ventadir)';
$$;

CREATE OR REPLACE FUNCTION public.portal_integracion_sync_portal_remate_to_tasaciones(
  p_portal_remate_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pr public.portal_remates%ROWTYPE;
  v_tasaciones_remate_id UUID;
  v_inicio TIMESTAMPTZ;
  v_cierre TIMESTAMPTZ;
  v_tipo TEXT;
  v_estado TEXT;
BEGIN
  SELECT *
    INTO v_pr
  FROM public.portal_remates
  WHERE id = p_portal_remate_id
  LIMIT 1;

  IF v_pr.id IS NULL THEN
    RETURN NULL;
  END IF;

  v_tasaciones_remate_id := COALESCE(v_pr.tasaciones_remate_id, gen_random_uuid());
  v_cierre := COALESCE(v_pr.ends_at, timezone('utc'::text, now()) + interval '24 hours');
  v_inicio := COALESCE(v_pr.starts_at, v_cierre - interval '24 hours');
  v_tipo := CASE
    WHEN public.portal_integracion_es_venta_directa(concat_ws(' ', v_pr.titulo, v_pr.descripcion)) THEN 'venta_directa'
    ELSE 'remate'
  END;
  v_estado := CASE WHEN v_pr.estado = 'cerrado' THEN 'cerrado' ELSE 'abierto' END;

  INSERT INTO public.remates (
    id,
    fecha_remate,
    fecha_hora_inicio,
    fecha_hora_cierre,
    fecha_hora_remate,
    descripcion,
    estado,
    tipo,
    created_by
  )
  VALUES (
    v_tasaciones_remate_id,
    (v_cierre AT TIME ZONE 'America/Santiago')::date,
    v_inicio,
    v_cierre,
    v_cierre,
    NULLIF(trim(concat_ws(' - ', v_pr.titulo, v_pr.descripcion)), ''),
    v_estado,
    v_tipo,
    v_pr.created_by
  )
  ON CONFLICT (id)
  DO UPDATE SET
    fecha_remate = EXCLUDED.fecha_remate,
    fecha_hora_inicio = EXCLUDED.fecha_hora_inicio,
    fecha_hora_cierre = EXCLUDED.fecha_hora_cierre,
    fecha_hora_remate = EXCLUDED.fecha_hora_remate,
    descripcion = EXCLUDED.descripcion,
    estado = EXCLUDED.estado,
    tipo = EXCLUDED.tipo,
    created_by = COALESCE(public.remates.created_by, EXCLUDED.created_by);

  IF v_pr.tasaciones_remate_id IS DISTINCT FROM v_tasaciones_remate_id THEN
    UPDATE public.portal_remates
    SET
      tasaciones_remate_id = v_tasaciones_remate_id,
      source_system = 'portal',
      updated_at = timezone('utc'::text, now())
    WHERE id = v_pr.id;
  END IF;

  RETURN v_tasaciones_remate_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.portal_integracion_sync_portal_lote_to_tasaciones(
  p_portal_lote_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_l public.portal_remate_lotes%ROWTYPE;
  v_pr public.portal_remates%ROWTYPE;
  v_inv RECORD;
  v_tasaciones_remate_id UUID;
  v_item_id UUID;
  v_patente TEXT;
  v_patente_norm TEXT;
  v_tipo_evento TEXT;
  v_estado_retiro TEXT;
BEGIN
  SELECT *
    INTO v_l
  FROM public.portal_remate_lotes
  WHERE id = p_portal_lote_id
  LIMIT 1;

  IF v_l.id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT *
    INTO v_pr
  FROM public.portal_remates
  WHERE id = v_l.remate_id
  LIMIT 1;

  IF v_pr.id IS NULL THEN
    RETURN NULL;
  END IF;

  v_tasaciones_remate_id := public.portal_integracion_sync_portal_remate_to_tasaciones(v_pr.id);
  IF v_tasaciones_remate_id IS NULL THEN
    RETURN NULL;
  END IF;

  v_item_id := COALESCE(v_l.tasaciones_remate_item_id, gen_random_uuid());

  SELECT
    i.id,
    i.patente,
    i.marca,
    i.modelo,
    i.ano,
    i.version,
    i.kilometraje,
    i.categoria,
    i.valor_minimo,
    i.valor_esperado
  INTO v_inv
  FROM public.inventario i
  WHERE i.id = v_l.inventario_id
  LIMIT 1;

  v_patente := NULLIF(trim(COALESCE(v_inv.patente, v_l.patente_normalizada)), '');
  IF v_patente IS NULL THEN
    RETURN NULL;
  END IF;
  v_patente_norm := public.portal_integracion_normalizar_patente(v_patente);

  v_tipo_evento := CASE
    WHEN public.portal_integracion_es_venta_directa(concat_ws(' ', v_pr.titulo, v_pr.descripcion)) THEN 'venta_directa'
    ELSE 'remate'
  END;
  v_estado_retiro := CASE
    WHEN v_tipo_evento = 'venta_directa' THEN 'en_bodega_a_venta_directa'
    ELSE 'en_bodega_a_remate'
  END;

  UPDATE public.inventario
  SET estado_retiro = v_estado_retiro
  WHERE id = v_l.inventario_id;

  IF v_l.inventario_id IS NULL THEN
    UPDATE public.inventario
    SET estado_retiro = v_estado_retiro
    WHERE public.portal_integracion_normalizar_patente(patente) = v_patente_norm;
  END IF;

  INSERT INTO public.remates_items (
    id,
    remate_id,
    tipo_documento,
    patente,
    marca,
    modelo,
    ano,
    version,
    kilometraje,
    categoria,
    valor_minimo,
    valor_esperado,
    extra_fields
  )
  VALUES (
    v_item_id,
    v_tasaciones_remate_id,
    'factura_exenta',
    v_patente,
    COALESCE(v_inv.marca, NULL),
    COALESCE(v_inv.modelo, NULL),
    COALESCE(v_inv.ano, NULL),
    COALESCE(v_inv.version, NULL),
    COALESCE(v_inv.kilometraje, NULL),
    COALESCE(v_inv.categoria, NULL),
    GREATEST(COALESCE(v_l.precio_base, v_inv.valor_minimo, 0), 0),
    GREATEST(COALESCE(v_l.precio_base, v_inv.valor_esperado, 0), 0),
    jsonb_build_object(
      'source_system', 'portal',
      'portal_remate_id', v_pr.id,
      'portal_lote_id', v_l.id,
      'synced_at', timezone('utc'::text, now())
    )
  )
  ON CONFLICT (id)
  DO UPDATE SET
    remate_id = EXCLUDED.remate_id,
    patente = EXCLUDED.patente,
    marca = EXCLUDED.marca,
    modelo = EXCLUDED.modelo,
    ano = EXCLUDED.ano,
    version = EXCLUDED.version,
    kilometraje = EXCLUDED.kilometraje,
    categoria = EXCLUDED.categoria,
    valor_minimo = EXCLUDED.valor_minimo,
    valor_esperado = EXCLUDED.valor_esperado,
    extra_fields = EXCLUDED.extra_fields;

  IF v_l.tasaciones_remate_item_id IS DISTINCT FROM v_item_id
     OR v_l.patente_normalizada IS DISTINCT FROM v_patente_norm
  THEN
    UPDATE public.portal_remate_lotes
    SET
      tasaciones_remate_item_id = v_item_id,
      patente_normalizada = v_patente_norm,
      source_system = 'portal'
    WHERE id = v_l.id;
  END IF;

  RETURN v_item_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.portal_integracion_tg_portal_remates_to_tasaciones()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.tasaciones_remate_id IS NOT NULL THEN
      DELETE FROM public.remates WHERE id = OLD.tasaciones_remate_id;
    END IF;
    RETURN OLD;
  END IF;

  -- Evita eco del flujo Tasaciones -> Portal.
  IF COALESCE(NEW.source_system, 'portal') <> 'portal' THEN
    RETURN NEW;
  END IF;

  PERFORM public.portal_integracion_sync_portal_remate_to_tasaciones(NEW.id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.portal_integracion_tg_portal_lotes_to_tasaciones()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.tasaciones_remate_item_id IS NOT NULL THEN
      DELETE FROM public.remates_items WHERE id = OLD.tasaciones_remate_item_id;
    END IF;
    RETURN OLD;
  END IF;

  -- Evita eco del flujo Tasaciones -> Portal.
  IF COALESCE(NEW.source_system, 'portal') <> 'portal' THEN
    RETURN NEW;
  END IF;

  PERFORM public.portal_integracion_sync_portal_lote_to_tasaciones(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_portal_integracion_portal_remates_to_tasaciones
  ON public.portal_remates;
CREATE TRIGGER trg_portal_integracion_portal_remates_to_tasaciones
AFTER INSERT OR UPDATE OR DELETE
ON public.portal_remates
FOR EACH ROW
EXECUTE FUNCTION public.portal_integracion_tg_portal_remates_to_tasaciones();

DROP TRIGGER IF EXISTS trg_portal_integracion_portal_lotes_to_tasaciones
  ON public.portal_remate_lotes;
CREATE TRIGGER trg_portal_integracion_portal_lotes_to_tasaciones
AFTER INSERT OR UPDATE OR DELETE
ON public.portal_remate_lotes
FOR EACH ROW
EXECUTE FUNCTION public.portal_integracion_tg_portal_lotes_to_tasaciones();

CREATE OR REPLACE FUNCTION public.portal_integracion_bootstrap_desde_portal(p_limit INT DEFAULT 5000)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_remate RECORD;
  v_lote RECORD;
  v_remates INT := 0;
  v_lotes INT := 0;
BEGIN
  FOR v_remate IN
    SELECT pr.id
    FROM public.portal_remates pr
    ORDER BY pr.created_at DESC
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 5000), 50000))
  LOOP
    PERFORM public.portal_integracion_sync_portal_remate_to_tasaciones(v_remate.id);
    v_remates := v_remates + 1;
  END LOOP;

  FOR v_lote IN
    SELECT l.id
    FROM public.portal_remate_lotes l
    ORDER BY l.created_at DESC
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 5000), 50000))
  LOOP
    PERFORM public.portal_integracion_sync_portal_lote_to_tasaciones(v_lote.id);
    v_lotes := v_lotes + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'remates', v_remates,
    'lotes', v_lotes
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.portal_integracion_sync_portal_remate_to_tasaciones(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.portal_integracion_sync_portal_lote_to_tasaciones(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.portal_integracion_bootstrap_desde_portal(INT) TO authenticated;
