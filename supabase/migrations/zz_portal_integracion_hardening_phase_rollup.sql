-- Hardening faseada de sincronización portal <-> tablas compartidas.
-- Incluye: seguridad de RPCs, idempotencia operativa básica, dashboard, replay,
-- manejo de eventos desconocidos, auditoría y borrado seguro.

ALTER TABLE IF EXISTS public.portal_remates
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE IF EXISTS public.remates
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE IF EXISTS public.portal_remates
  ADD COLUMN IF NOT EXISTS sync_version BIGINT NOT NULL DEFAULT 0;

ALTER TABLE IF EXISTS public.remates
  ADD COLUMN IF NOT EXISTS sync_version BIGINT NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.portal_integracion_sync_conflicts (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  source_system TEXT,
  reason TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.portal_integracion_audit (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  event_type TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  outbox_id BIGINT,
  status TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- Definición canónica para evitar drift entre migraciones previas.
CREATE OR REPLACE FUNCTION public.portal_integracion_sync_remate(p_tasaciones_remate_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_duration_hours INT := 24;
  v_r RECORD;
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
    r.fecha_hora_inicio,
    r.fecha_hora_cierre,
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

  v_ends_at := COALESCE(v_r.fecha_hora_cierre, v_r.fecha_hora_remate);
  v_starts_at := COALESCE(v_r.fecha_hora_inicio, v_ends_at - make_interval(hours => COALESCE(v_duration_hours, 24)));
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

CREATE UNIQUE INDEX IF NOT EXISTS uq_portal_integracion_outbox_open_event
  ON public.portal_integracion_outbox(event_type, aggregate_type, aggregate_id)
  WHERE status IN ('pending', 'processing');

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
  ON CONFLICT (event_type, aggregate_type, aggregate_id)
    WHERE status IN ('pending', 'processing')
  DO UPDATE SET
    payload = EXCLUDED.payload,
    updated_at = timezone('utc'::text, now()),
    available_at = LEAST(public.portal_integracion_outbox.available_at, timezone('utc'::text, now()))
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

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
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 200), 5000))
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
          RAISE EXCEPTION 'EVENTO_DESCONOCIDO: %', v_job.event_type USING ERRCODE = 'P0001';
      END CASE;

      UPDATE public.portal_integracion_outbox
      SET
        status = 'done',
        processed_at = timezone('utc'::text, now()),
        updated_at = timezone('utc'::text, now()),
        last_error = NULL
      WHERE id = v_job.id;

      INSERT INTO public.portal_integracion_audit(event_type, aggregate_type, aggregate_id, outbox_id, status, details)
      VALUES (
        v_job.event_type,
        v_job.aggregate_type,
        v_job.aggregate_id,
        v_job.id,
        'done',
        jsonb_build_object('attempt', v_attempt)
      );

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
          -- Backoff exponencial con jitter acotado.
          UPDATE public.portal_integracion_outbox
          SET
            status = 'pending',
            available_at = timezone('utc'::text, now())
              + make_interval(
                  secs => LEAST(
                    3600,
                    (COALESCE(v_retry_delay, 15) * (2 ^ LEAST(v_attempt, 10)))
                    + floor(random() * 7)::INT
                  )
                ),
            last_error = SQLERRM,
            updated_at = timezone('utc'::text, now())
          WHERE id = v_job.id;
        END IF;

        INSERT INTO public.portal_integracion_audit(event_type, aggregate_type, aggregate_id, outbox_id, status, details)
        VALUES (
          v_job.event_type,
          v_job.aggregate_type,
          v_job.aggregate_id,
          v_job.id,
          'error',
          jsonb_build_object('attempt', v_attempt, 'error', SQLERRM)
        );

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

CREATE OR REPLACE FUNCTION public.portal_integracion_sync_dashboard()
RETURNS TABLE (
  pending BIGINT,
  failed BIGINT,
  processing BIGINT,
  done_today BIGINT,
  last_processed_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COUNT(*) FILTER (WHERE status = 'pending') AS pending,
    COUNT(*) FILTER (WHERE status = 'failed') AS failed,
    COUNT(*) FILTER (WHERE status = 'processing') AS processing,
    COUNT(*) FILTER (
      WHERE status = 'done'
        AND processed_at >= date_trunc('day', timezone('utc'::text, now()))
    ) AS done_today,
    MAX(processed_at) FILTER (WHERE status = 'done') AS last_processed_at
  FROM public.portal_integracion_outbox;
$$;

CREATE OR REPLACE FUNCTION public.portal_integracion_replay_failed(p_limit INT DEFAULT 200)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT := 0;
BEGIN
  UPDATE public.portal_integracion_outbox
  SET
    status = 'pending',
    available_at = timezone('utc'::text, now()),
    updated_at = timezone('utc'::text, now()),
    last_error = NULL
  WHERE id IN (
    SELECT id
    FROM public.portal_integracion_outbox
    WHERE status = 'failed'
    ORDER BY id DESC
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 200), 5000))
  );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'replayed', v_count);
END;
$$;

CREATE OR REPLACE FUNCTION public.portal_integracion_tg_prevent_linked_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.tasaciones_remate_id IS NOT NULL THEN
    RAISE EXCEPTION 'No se permite borrar remates vinculados a Tasaciones. Cierra/despublica primero.';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_portal_integracion_prevent_linked_delete ON public.portal_remates;
CREATE TRIGGER trg_portal_integracion_prevent_linked_delete
BEFORE DELETE ON public.portal_remates
FOR EACH ROW
EXECUTE FUNCTION public.portal_integracion_tg_prevent_linked_delete();

-- Seguridad: restringe ejecución de funciones críticas al rol de servicio.
REVOKE EXECUTE ON FUNCTION public.portal_integracion_procesar_outbox(INT) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.portal_integracion_bootstrap_desde_tasaciones(INT) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.portal_integracion_bootstrap_desde_portal(INT) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.portal_integracion_replay_failed(INT) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.portal_integracion_sync_dashboard() FROM authenticated;

DO $$
BEGIN
  BEGIN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.portal_integracion_procesar_outbox(INT) TO service_role';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.portal_integracion_bootstrap_desde_tasaciones(INT) TO service_role';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.portal_integracion_bootstrap_desde_portal(INT) TO service_role';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.portal_integracion_replay_failed(INT) TO service_role';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.portal_integracion_sync_dashboard() TO service_role';
  EXCEPTION
    WHEN undefined_object THEN
      NULL;
  END;
END $$;
