-- Garantiza propagación canónica del número de remate entre plataformas.
-- Nota: en algunos entornos `remates.numero_remate` es columna GENERATED y no editable.
-- En ese caso, preservamos el canónico en `portal_remates.source_event_number`.

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
  v_existing_remate public.remates%ROWTYPE;
  v_tasaciones_remate_id UUID;
  v_inicio TIMESTAMPTZ;
  v_cierre TIMESTAMPTZ;
  v_tipo TEXT;
  v_estado TEXT;
  v_titulo_limpio TEXT;
  v_descripcion_limpia TEXT;
  v_descripcion_final TEXT;
  v_norm_desc TEXT;
  v_norm_title TEXT;
  v_numero_digits TEXT;
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

  v_titulo_limpio := NULLIF(trim(COALESCE(v_pr.titulo, '')), '');
  v_descripcion_limpia := NULLIF(trim(COALESCE(v_pr.descripcion, '')), '');
  v_descripcion_final := COALESCE(v_descripcion_limpia, v_titulo_limpio);

  IF v_descripcion_final IS NOT NULL AND v_titulo_limpio IS NOT NULL THEN
    v_norm_desc := regexp_replace(lower(v_descripcion_final), '[^a-z0-9]+', '', 'g');
    v_norm_title := regexp_replace(lower(v_titulo_limpio), '[^a-z0-9]+', '', 'g');
    IF v_norm_desc <> '' AND v_norm_desc = v_norm_title THEN
      v_descripcion_final := v_descripcion_limpia;
    END IF;
  END IF;

  -- Numero canónico: source_event_number -> titulo
  IF NULLIF(trim(COALESCE(v_pr.source_event_number, '')), '') IS NULL THEN
    v_numero_digits := NULLIF(substring(COALESCE(v_pr.titulo, '') from '#\s*([0-9]+)'), '');
    IF v_numero_digits IS NOT NULL THEN
      v_pr.source_event_number := format('Remate #%s', v_numero_digits);
    END IF;
  END IF;

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
    v_descripcion_final,
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
      source_event_number = COALESCE(NULLIF(v_pr.source_event_number, ''), source_event_number),
      updated_at = timezone('utc'::text, now())
    WHERE id = v_pr.id;
  END IF;

  RETURN v_tasaciones_remate_id;
END;
$$;

-- Backfill seguro:
-- - Siempre consolida `source_event_number` en portal_remates.
-- - Solo intenta actualizar `remates.numero_remate` si NO es columna generated.
WITH canonical AS (
  SELECT
    pr.id AS portal_remate_id,
    pr.tasaciones_remate_id AS remate_id,
    NULLIF(
      trim(
        COALESCE(
          pr.source_event_number,
          CASE
            WHEN substring(COALESCE(pr.titulo, '') from '#\s*([0-9]+)') IS NOT NULL
              THEN format('Remate #%s', substring(COALESCE(pr.titulo, '') from '#\s*([0-9]+)'))
            ELSE NULL
          END
        )
      ),
      ''
    ) AS numero_canonico
  FROM public.portal_remates pr
  WHERE pr.tasaciones_remate_id IS NOT NULL
),
portal_backfill AS (
  UPDATE public.portal_remates pr
  SET
    source_event_number = c.numero_canonico,
    updated_at = timezone('utc'::text, now())
  FROM canonical c
  WHERE pr.id = c.portal_remate_id
    AND c.numero_canonico IS NOT NULL
    AND COALESCE(pr.source_event_number, '') IS DISTINCT FROM c.numero_canonico
  RETURNING pr.id
)
SELECT count(*) FROM portal_backfill;

DO $$
DECLARE
  v_is_generated TEXT := 'NEVER';
BEGIN
  SELECT c.is_generated
    INTO v_is_generated
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'remates'
    AND c.column_name = 'numero_remate'
  LIMIT 1;

  IF COALESCE(v_is_generated, 'NEVER') <> 'ALWAYS' THEN
    WITH canonical AS (
      SELECT
        pr.tasaciones_remate_id AS remate_id,
        NULLIF(
          trim(
            COALESCE(
              pr.source_event_number,
              CASE
                WHEN substring(COALESCE(pr.titulo, '') from '#\s*([0-9]+)') IS NOT NULL
                  THEN format('Remate #%s', substring(COALESCE(pr.titulo, '') from '#\s*([0-9]+)'))
                ELSE NULL
              END
            )
          ),
          ''
        ) AS numero_canonico
      FROM public.portal_remates pr
      WHERE pr.tasaciones_remate_id IS NOT NULL
    )
    UPDATE public.remates r
    SET numero_remate = c.numero_canonico
    FROM canonical c
    WHERE r.id = c.remate_id
      AND c.numero_canonico IS NOT NULL
      AND trim(COALESCE(r.numero_remate, '')) IS DISTINCT FROM c.numero_canonico;
  END IF;
END $$;

