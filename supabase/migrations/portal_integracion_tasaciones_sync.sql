-- Integracion Tasaciones <-> Portal Remates (misma base Supabase).
-- Objetivos:
-- 1) Sincronizar eventos y unidades desde tablas Tasaciones (remates/remates_items/inventario)
--    hacia portal_remates/portal_remate_lotes.
-- 2) Devolver historial completo de ofertas del portal hacia una tabla consumible por Tasaciones.
-- 3) Orquestar con outbox + retries + alertas (sin tocar codigo del proyecto Tasaciones).

-- ============================================================================
-- Configuracion + outbox/alertas
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.portal_integracion_config (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  remate_duration_hours INT NOT NULL DEFAULT 24 CHECK (remate_duration_hours BETWEEN 1 AND 168),
  retry_max_attempts INT NOT NULL DEFAULT 8 CHECK (retry_max_attempts BETWEEN 1 AND 50),
  retry_delay_seconds INT NOT NULL DEFAULT 15 CHECK (retry_delay_seconds BETWEEN 1 AND 3600),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

INSERT INTO public.portal_integracion_config (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.portal_integracion_outbox (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  available_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  event_type TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'done', 'failed')),
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT,
  processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_portal_integracion_outbox_pending
  ON public.portal_integracion_outbox (status, available_at, id)
  WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS public.portal_integracion_alertas (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  outbox_id BIGINT REFERENCES public.portal_integracion_outbox (id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  aggregate_id TEXT,
  error TEXT NOT NULL,
  resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_at TIMESTAMPTZ
);

-- ============================================================================
-- Campos de mapeo en tablas del portal
-- ============================================================================

ALTER TABLE public.portal_remates
ADD COLUMN IF NOT EXISTS source_system TEXT NOT NULL DEFAULT 'portal';
ALTER TABLE public.portal_remates
ADD COLUMN IF NOT EXISTS tasaciones_remate_id UUID;
ALTER TABLE public.portal_remates
ADD COLUMN IF NOT EXISTS source_event_number TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_portal_remates_tasaciones_remate_id
  ON public.portal_remates (tasaciones_remate_id)
  WHERE tasaciones_remate_id IS NOT NULL;

ALTER TABLE public.portal_remate_lotes
ADD COLUMN IF NOT EXISTS source_system TEXT NOT NULL DEFAULT 'portal';
ALTER TABLE public.portal_remate_lotes
ADD COLUMN IF NOT EXISTS tasaciones_remate_item_id UUID;
ALTER TABLE public.portal_remate_lotes
ADD COLUMN IF NOT EXISTS patente_normalizada TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_portal_lotes_tasaciones_item_id
  ON public.portal_remate_lotes (tasaciones_remate_item_id)
  WHERE tasaciones_remate_item_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_portal_lotes_patente_norm
  ON public.portal_remate_lotes (patente_normalizada)
  WHERE patente_normalizada IS NOT NULL;

-- ============================================================================
-- Historial de ofertas para Tasaciones
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.tasaciones_remate_ofertas_historial (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  portal_oferta_id UUID NOT NULL UNIQUE REFERENCES public.portal_ofertas(id) ON DELETE CASCADE,
  portal_remate_id UUID NOT NULL REFERENCES public.portal_remates(id) ON DELETE CASCADE,
  portal_lote_id UUID NOT NULL REFERENCES public.portal_remate_lotes(id) ON DELETE CASCADE,
  tasaciones_remate_id UUID,
  tasaciones_remate_item_id UUID,
  patente TEXT,
  monto NUMERIC NOT NULL,
  ofertante_user_id UUID,
  ofertante_email TEXT,
  ofertante_nombre TEXT,
  es_auto BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_tasaciones_historial_item_created
  ON public.tasaciones_remate_ofertas_historial (tasaciones_remate_item_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tasaciones_historial_patente_created
  ON public.tasaciones_remate_ofertas_historial (patente, created_at DESC);

ALTER TABLE public.tasaciones_remate_ofertas_historial ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tasaciones_historial_select_admin_sac ON public.tasaciones_remate_ofertas_historial;
CREATE POLICY tasaciones_historial_select_admin_sac
  ON public.tasaciones_remate_ofertas_historial
  FOR SELECT
  TO authenticated
  USING (public.auth_user_es_admin_o_sac());

DROP POLICY IF EXISTS tasaciones_historial_select_cliente_dueno ON public.tasaciones_remate_ofertas_historial;
CREATE POLICY tasaciones_historial_select_cliente_dueno
  ON public.tasaciones_remate_ofertas_historial
  FOR SELECT
  TO authenticated
  USING (
    COALESCE((SELECT rol FROM public.profiles WHERE id = auth.uid()), 'usuario') = 'cliente_empresa'
    AND EXISTS (
      SELECT 1
      FROM public.inventario i
      WHERE upper(trim(COALESCE(i.patente, ''))) = upper(trim(COALESCE(tasaciones_remate_ofertas_historial.patente, '')))
        AND i.empresa_id IS NOT NULL
        AND public.empresa_visible_a_cliente(auth.uid(), i.empresa_id)
    )
  );

REVOKE ALL ON TABLE public.tasaciones_remate_ofertas_historial FROM PUBLIC;
GRANT SELECT ON TABLE public.tasaciones_remate_ofertas_historial TO authenticated;

-- ============================================================================
-- Helpers
-- ============================================================================

CREATE OR REPLACE FUNCTION public.portal_integracion_normalizar_patente(p_patente TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(upper(regexp_replace(COALESCE(trim(p_patente), ''), '[^A-Za-z0-9]', '', 'g')), '');
$$;

CREATE OR REPLACE FUNCTION public.portal_integracion_enqueue(
  p_event_type TEXT,
  p_aggregate_type TEXT,
  p_aggregate_id TEXT,
  p_payload JSONB DEFAULT '{}'::jsonb
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id BIGINT;
BEGIN
  INSERT INTO public.portal_integracion_outbox (
    event_type,
    aggregate_type,
    aggregate_id,
    payload
  )
  VALUES (
    p_event_type,
    p_aggregate_type,
    p_aggregate_id,
    COALESCE(p_payload, '{}'::jsonb)
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.portal_integracion_estado_remate(
  p_starts_at TIMESTAMPTZ,
  p_ends_at TIMESTAMPTZ,
  p_tasaciones_estado TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_now TIMESTAMPTZ := timezone('utc'::text, now());
  v_estado TEXT := lower(COALESCE(trim(p_tasaciones_estado), ''));
BEGIN
  IF v_estado = 'cerrado' OR p_ends_at <= v_now THEN
    RETURN 'cerrado';
  END IF;
  IF p_starts_at <= v_now THEN
    RETURN 'en_curso';
  END IF;
  RETURN 'publicado';
END;
$$;

-- ============================================================================
-- Sync Tasaciones -> Portal
-- ============================================================================

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

  v_es_elegible := COALESCE(v_inv.estado_retiro, '') = 'en_bodega_a_remate';
  v_es_vendido := COALESCE(v_inv.estado_retiro, '') = 'vendido_fuera_bodega'
                  OR COALESCE(v_inv.valor_venta, 0) > 0
                  OR v_inv.fecha_venta IS NOT NULL;

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

CREATE OR REPLACE FUNCTION public.portal_integracion_sync_patente(p_patente TEXT)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_patente_norm TEXT := public.portal_integracion_normalizar_patente(p_patente);
  v_count INT := 0;
  v_item RECORD;
BEGIN
  IF v_patente_norm IS NULL THEN
    RETURN 0;
  END IF;

  FOR v_item IN
    SELECT ri.id
    FROM public.remates_items ri
    WHERE public.portal_integracion_normalizar_patente(ri.patente) = v_patente_norm
  LOOP
    PERFORM public.portal_integracion_sync_remate_item(v_item.id);
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- ============================================================================
-- Sync Portal -> Tasaciones (historial ofertas)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.portal_integracion_sync_oferta_to_tasaciones(p_portal_oferta_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row RECORD;
  v_hist_id UUID;
BEGIN
  SELECT
    o.id AS portal_oferta_id,
    o.created_at,
    o.monto,
    o.user_id,
    l.id AS portal_lote_id,
    l.remate_id AS portal_remate_id,
    l.tasaciones_remate_item_id,
    l.patente_normalizada,
    r.tasaciones_remate_id,
    u.email AS ofertante_email,
    p.nombre AS ofertante_nombre,
    COALESCE(a.is_auto_bid, false) AS es_auto
  INTO v_row
  FROM public.portal_ofertas o
  JOIN public.portal_remate_lotes l ON l.id = o.lote_id
  JOIN public.portal_remates r ON r.id = l.remate_id
  LEFT JOIN auth.users u ON u.id = o.user_id
  LEFT JOIN public.profiles p ON p.id = o.user_id
  LEFT JOIN public.portal_ofertas_audit a ON a.oferta_id = o.id
  WHERE o.id = p_portal_oferta_id
  LIMIT 1;

  IF v_row.portal_oferta_id IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.tasaciones_remate_ofertas_historial (
    portal_oferta_id,
    portal_remate_id,
    portal_lote_id,
    tasaciones_remate_id,
    tasaciones_remate_item_id,
    patente,
    monto,
    ofertante_user_id,
    ofertante_email,
    ofertante_nombre,
    es_auto,
    metadata
  )
  VALUES (
    v_row.portal_oferta_id,
    v_row.portal_remate_id,
    v_row.portal_lote_id,
    v_row.tasaciones_remate_id,
    v_row.tasaciones_remate_item_id,
    v_row.patente_normalizada,
    v_row.monto,
    v_row.user_id,
    v_row.ofertante_email,
    v_row.ofertante_nombre,
    v_row.es_auto,
    jsonb_build_object('source', 'portal_ofertas', 'created_at', v_row.created_at)
  )
  ON CONFLICT (portal_oferta_id)
  DO UPDATE SET
    monto = EXCLUDED.monto,
    es_auto = EXCLUDED.es_auto,
    metadata = EXCLUDED.metadata
  RETURNING id INTO v_hist_id;

  RETURN v_hist_id;
END;
$$;

-- ============================================================================
-- Processor de outbox
-- ============================================================================

CREATE OR REPLACE FUNCTION public.portal_integracion_procesar_outbox(p_limit INT DEFAULT 200)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job RECORD;
  v_processed INT := 0;
  v_failed INT := 0;
  v_retry_max INT := 8;
  v_retry_delay INT := 15;
  v_attempt INT;
BEGIN
  SELECT retry_max_attempts, retry_delay_seconds
    INTO v_retry_max, v_retry_delay
  FROM public.portal_integracion_config
  WHERE id = 1;

  FOR v_job IN
    SELECT *
    FROM public.portal_integracion_outbox
    WHERE status = 'pending'
      AND available_at <= timezone('utc'::text, now())
    ORDER BY id
    FOR UPDATE SKIP LOCKED
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 200), 2000))
  LOOP
    UPDATE public.portal_integracion_outbox
    SET
      status = 'processing',
      attempts = attempts + 1,
      updated_at = timezone('utc'::text, now())
    WHERE id = v_job.id
    RETURNING attempts INTO v_attempt;

    BEGIN
      CASE v_job.event_type
        WHEN 'tasaciones.remate.changed' THEN
          PERFORM public.portal_integracion_sync_remate((v_job.aggregate_id)::uuid);
        WHEN 'tasaciones.remate.deleted' THEN
          PERFORM public.portal_integracion_sync_remate((v_job.aggregate_id)::uuid);
        WHEN 'tasaciones.remate_item.changed' THEN
          PERFORM public.portal_integracion_sync_remate_item((v_job.aggregate_id)::uuid);
        WHEN 'tasaciones.remate_item.deleted' THEN
          PERFORM public.portal_integracion_sync_remate_item((v_job.aggregate_id)::uuid);
        WHEN 'tasaciones.inventario.changed' THEN
          PERFORM public.portal_integracion_sync_patente(v_job.payload->>'patente');
        WHEN 'portal.bid.created' THEN
          PERFORM public.portal_integracion_sync_oferta_to_tasaciones((v_job.aggregate_id)::uuid);
        ELSE
          -- Evento desconocido: marcar done para evitar bloqueo.
          NULL;
      END CASE;

      UPDATE public.portal_integracion_outbox
      SET
        status = 'done',
        processed_at = timezone('utc'::text, now()),
        updated_at = timezone('utc'::text, now()),
        last_error = NULL
      WHERE id = v_job.id;

      v_processed := v_processed + 1;
    EXCEPTION
      WHEN OTHERS THEN
        IF v_attempt >= COALESCE(v_retry_max, 8) THEN
          UPDATE public.portal_integracion_outbox
          SET
            status = 'failed',
            last_error = SQLERRM,
            updated_at = timezone('utc'::text, now())
          WHERE id = v_job.id;

          INSERT INTO public.portal_integracion_alertas (outbox_id, event_type, aggregate_id, error)
          VALUES (v_job.id, v_job.event_type, v_job.aggregate_id, SQLERRM);
        ELSE
          UPDATE public.portal_integracion_outbox
          SET
            status = 'pending',
            available_at = timezone('utc'::text, now()) + make_interval(secs => COALESCE(v_retry_delay, 15) * LEAST(v_attempt, 10)),
            last_error = SQLERRM,
            updated_at = timezone('utc'::text, now())
          WHERE id = v_job.id;
        END IF;

        v_failed := v_failed + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'processed', v_processed,
    'failed', v_failed
  );
END;
$$;

-- ============================================================================
-- Backfill inicial (opcional)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.portal_integracion_bootstrap_desde_tasaciones(p_limit INT DEFAULT 5000)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_remate RECORD;
  v_item RECORD;
  v_remates INT := 0;
  v_items INT := 0;
BEGIN
  FOR v_remate IN
    SELECT r.id
    FROM public.remates r
    ORDER BY r.created_at DESC
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 5000), 50000))
  LOOP
    PERFORM public.portal_integracion_sync_remate(v_remate.id);
    v_remates := v_remates + 1;
  END LOOP;

  FOR v_item IN
    SELECT ri.id
    FROM public.remates_items ri
    ORDER BY ri.created_at DESC
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 5000), 50000))
  LOOP
    PERFORM public.portal_integracion_sync_remate_item(v_item.id);
    v_items := v_items + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'remates', v_remates,
    'items', v_items
  );
END;
$$;

-- ============================================================================
-- Triggers de encolado (si existen tablas Tasaciones)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.portal_integracion_tg_remates_enqueue()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.portal_integracion_enqueue('tasaciones.remate.deleted', 'remates', OLD.id::text, '{}'::jsonb);
    RETURN OLD;
  END IF;

  PERFORM public.portal_integracion_enqueue(
    'tasaciones.remate.changed',
    'remates',
    NEW.id::text,
    jsonb_build_object('estado', NEW.estado)
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.portal_integracion_tg_remates_items_enqueue()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.portal_integracion_enqueue('tasaciones.remate_item.deleted', 'remates_items', OLD.id::text, '{}'::jsonb);
    RETURN OLD;
  END IF;

  PERFORM public.portal_integracion_enqueue(
    'tasaciones.remate_item.changed',
    'remates_items',
    NEW.id::text,
    jsonb_build_object('patente', NEW.patente)
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.portal_integracion_tg_inventario_enqueue()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_pat TEXT;
  v_new_pat TEXT;
BEGIN
  v_old_pat := public.portal_integracion_normalizar_patente(OLD.patente);
  v_new_pat := public.portal_integracion_normalizar_patente(NEW.patente);

  IF TG_OP = 'INSERT' THEN
    IF v_new_pat IS NOT NULL THEN
      PERFORM public.portal_integracion_enqueue(
        'tasaciones.inventario.changed',
        'inventario',
        NEW.id::text,
        jsonb_build_object('patente', v_new_pat, 'estado_retiro', NEW.estado_retiro)
      );
    END IF;
    RETURN NEW;
  END IF;

  IF v_old_pat IS DISTINCT FROM v_new_pat THEN
    IF v_old_pat IS NOT NULL THEN
      PERFORM public.portal_integracion_enqueue(
        'tasaciones.inventario.changed',
        'inventario',
        NEW.id::text,
        jsonb_build_object('patente', v_old_pat, 'estado_retiro', NEW.estado_retiro)
      );
    END IF;
    IF v_new_pat IS NOT NULL THEN
      PERFORM public.portal_integracion_enqueue(
        'tasaciones.inventario.changed',
        'inventario',
        NEW.id::text,
        jsonb_build_object('patente', v_new_pat, 'estado_retiro', NEW.estado_retiro)
      );
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.estado_retiro IS DISTINCT FROM OLD.estado_retiro
     OR NEW.valor_venta IS DISTINCT FROM OLD.valor_venta
     OR NEW.fecha_venta IS DISTINCT FROM OLD.fecha_venta
  THEN
    IF v_new_pat IS NOT NULL THEN
      PERFORM public.portal_integracion_enqueue(
        'tasaciones.inventario.changed',
        'inventario',
        NEW.id::text,
        jsonb_build_object('patente', v_new_pat, 'estado_retiro', NEW.estado_retiro)
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.portal_integracion_tg_portal_ofertas_enqueue()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.portal_integracion_enqueue(
    'portal.bid.created',
    'portal_ofertas',
    NEW.id::text,
    jsonb_build_object('lote_id', NEW.lote_id, 'monto', NEW.monto)
  );
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.remates') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_portal_integracion_remates_enqueue ON public.remates';
    EXECUTE 'CREATE TRIGGER trg_portal_integracion_remates_enqueue AFTER INSERT OR UPDATE OR DELETE ON public.remates FOR EACH ROW EXECUTE FUNCTION public.portal_integracion_tg_remates_enqueue()';
  END IF;

  IF to_regclass('public.remates_items') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_portal_integracion_remates_items_enqueue ON public.remates_items';
    EXECUTE 'CREATE TRIGGER trg_portal_integracion_remates_items_enqueue AFTER INSERT OR UPDATE OR DELETE ON public.remates_items FOR EACH ROW EXECUTE FUNCTION public.portal_integracion_tg_remates_items_enqueue()';
  END IF;

  IF to_regclass('public.inventario') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_portal_integracion_inventario_enqueue ON public.inventario';
    EXECUTE 'CREATE TRIGGER trg_portal_integracion_inventario_enqueue AFTER INSERT OR UPDATE ON public.inventario FOR EACH ROW EXECUTE FUNCTION public.portal_integracion_tg_inventario_enqueue()';
  END IF;

  IF to_regclass('public.portal_ofertas') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_portal_integracion_portal_ofertas_enqueue ON public.portal_ofertas';
    EXECUTE 'CREATE TRIGGER trg_portal_integracion_portal_ofertas_enqueue AFTER INSERT ON public.portal_ofertas FOR EACH ROW EXECUTE FUNCTION public.portal_integracion_tg_portal_ofertas_enqueue()';
  END IF;
END $$;

-- ============================================================================
-- Permisos
-- ============================================================================

REVOKE ALL ON TABLE public.portal_integracion_outbox FROM PUBLIC;
REVOKE ALL ON TABLE public.portal_integracion_alertas FROM PUBLIC;
REVOKE ALL ON TABLE public.portal_integracion_config FROM PUBLIC;

GRANT SELECT, INSERT, UPDATE ON TABLE public.portal_integracion_outbox TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.portal_integracion_alertas TO authenticated;
GRANT SELECT ON TABLE public.portal_integracion_config TO authenticated;

GRANT EXECUTE ON FUNCTION public.portal_integracion_enqueue(TEXT, TEXT, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.portal_integracion_procesar_outbox(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.portal_integracion_bootstrap_desde_tasaciones(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.portal_integracion_sync_remate(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.portal_integracion_sync_remate_item(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.portal_integracion_sync_patente(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.portal_integracion_sync_oferta_to_tasaciones(UUID) TO authenticated;

COMMENT ON TABLE public.portal_integracion_outbox IS 'Outbox de eventos de sincronizacion Tasaciones <-> Portal Remates.';
COMMENT ON TABLE public.portal_integracion_alertas IS 'Alertas para eventos fallidos tras agotar retries.';
COMMENT ON TABLE public.tasaciones_remate_ofertas_historial IS 'Historial consolidado de ofertas del portal para consumo de Tasaciones.';
COMMENT ON FUNCTION public.portal_integracion_procesar_outbox(INT) IS 'Procesa eventos pending del outbox con retries y alertas.';
