-- Ajuste de elegibilidad de lotes Tasaciones -> Portal.
-- Evita falsos 0 vehiculos cuando estado_retiro viene con variaciones
-- o cuando la unidad aun no tiene match estricto en inventario.

CREATE OR REPLACE FUNCTION public.portal_integracion_sync_remate_item(p_tasaciones_item_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item RECORD;
  v_inv RECORD;
  v_portal_remate_id UUID;
  v_lote_id UUID;
  v_patente_norm TEXT;
  v_es_elegible BOOLEAN := false;
  v_es_vendido BOOLEAN := false;
  v_precio_base NUMERIC := 0;
  v_orden INT := 0;
  v_titulo_lote TEXT;
  v_estado_retiro_norm TEXT := '';
BEGIN
  SELECT
    ri.id,
    ri.remate_id,
    ri.tipo_documento,
    ri.patente,
    ri.marca,
    ri.modelo,
    ri.ano,
    ri.version,
    ri.kilometraje,
    ri.valor_minimo,
    ri.valor_esperado,
    ri.csv_lote
  INTO v_item
  FROM public.remates_items ri
  WHERE ri.id = p_tasaciones_item_id
  LIMIT 1;

  IF v_item.id IS NULL THEN
    UPDATE public.portal_remate_lotes
    SET estado = CASE WHEN estado = 'vendido' THEN 'vendido' ELSE 'anulado' END
    WHERE tasaciones_remate_item_id = p_tasaciones_item_id;
    RETURN NULL;
  END IF;

  v_patente_norm := public.portal_integracion_normalizar_patente(v_item.patente);
  IF v_patente_norm IS NULL THEN
    UPDATE public.portal_remate_lotes
    SET estado = CASE WHEN estado = 'vendido' THEN 'vendido' ELSE 'anulado' END
    WHERE tasaciones_remate_item_id = p_tasaciones_item_id;
    RETURN NULL;
  END IF;

  SELECT
    i.id,
    i.estado_retiro,
    i.valor_minimo,
    i.valor_esperado,
    i.valor_venta,
    i.fecha_venta
  INTO v_inv
  FROM public.inventario i
  WHERE public.portal_integracion_normalizar_patente(i.patente) = v_patente_norm
  ORDER BY i.created_at DESC
  LIMIT 1;

  v_estado_retiro_norm := lower(trim(COALESCE(v_inv.estado_retiro, '')));
  v_es_vendido := v_estado_retiro_norm LIKE '%vendido%'
                  OR COALESCE(v_inv.valor_venta, 0) > 0
                  OR v_inv.fecha_venta IS NOT NULL;

  -- Regla mas flexible: si no está vendido, se considera elegible para publicar.
  v_es_elegible := NOT v_es_vendido;

  IF NOT v_es_elegible THEN
    UPDATE public.portal_remate_lotes
    SET estado = CASE WHEN v_es_vendido THEN 'vendido' ELSE 'anulado' END
    WHERE tasaciones_remate_item_id = p_tasaciones_item_id;
    RETURN NULL;
  END IF;

  v_portal_remate_id := public.portal_integracion_sync_remate(v_item.remate_id);
  IF v_portal_remate_id IS NULL THEN
    RETURN NULL;
  END IF;

  v_precio_base := COALESCE(v_item.valor_minimo, v_inv.valor_minimo, v_item.valor_esperado, v_inv.valor_esperado, 0);
  IF v_precio_base < 0 THEN v_precio_base := 0; END IF;

  IF COALESCE(v_item.csv_lote, '') ~ '^[0-9]+$' THEN
    v_orden := (v_item.csv_lote)::INT;
  END IF;

  v_titulo_lote := trim(concat_ws(' ', v_patente_norm, NULLIF(trim(COALESCE(v_item.marca, '')), ''), NULLIF(trim(COALESCE(v_item.modelo, '')), '')));
  IF v_titulo_lote = '' THEN
    v_titulo_lote := v_patente_norm;
  END IF;

  INSERT INTO public.portal_remate_lotes (
    remate_id,
    inventario_id,
    orden,
    titulo,
    descripcion,
    precio_base,
    incremento_minimo,
    estado,
    source_system,
    tasaciones_remate_item_id,
    patente_normalizada
  )
  VALUES (
    v_portal_remate_id,
    v_inv.id,
    COALESCE(v_orden, 0),
    v_titulo_lote,
    NULLIF(trim(concat_ws(' | ', NULLIF(trim(COALESCE(v_item.tipo_documento, '')), ''), NULLIF(trim(COALESCE(v_item.version, '')), ''))), ''),
    v_precio_base,
    50000,
    'pendiente',
    'tasaciones',
    v_item.id,
    v_patente_norm
  )
  ON CONFLICT (tasaciones_remate_item_id)
  DO UPDATE SET
    remate_id = EXCLUDED.remate_id,
    inventario_id = EXCLUDED.inventario_id,
    orden = EXCLUDED.orden,
    titulo = EXCLUDED.titulo,
    descripcion = EXCLUDED.descripcion,
    precio_base = EXCLUDED.precio_base,
    source_system = EXCLUDED.source_system,
    patente_normalizada = EXCLUDED.patente_normalizada,
    estado = CASE
      WHEN portal_remate_lotes.estado IN ('vendido', 'adjudicado') THEN portal_remate_lotes.estado
      ELSE 'pendiente'
    END
  RETURNING id INTO v_lote_id;

  RETURN v_lote_id;
END;
$$;
