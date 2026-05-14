-- Evita el bucle de concatenación titulo/descripcion en la sincronización Portal -> Tasaciones.
-- Caso detectado: al sincronizar ida/vuelta, `titulo` ya venía con numero+descripcion y se volvía
-- a concatenar con `descripcion`, generando nombres repetidos en Tasaciones.

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
  v_titulo_limpio TEXT;
  v_descripcion_limpia TEXT;
  v_descripcion_final TEXT;
  v_norm_desc TEXT;
  v_norm_title TEXT;
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
  -- Nunca concatenar titulo+descripcion aquí para evitar realimentación de texto duplicado.
  v_descripcion_final := COALESCE(v_descripcion_limpia, v_titulo_limpio);

  -- Si descripción y título son esencialmente iguales, priorizamos una sola versión.
  IF v_descripcion_final IS NOT NULL AND v_titulo_limpio IS NOT NULL THEN
    v_norm_desc := regexp_replace(lower(v_descripcion_final), '[^a-z0-9]+', '', 'g');
    v_norm_title := regexp_replace(lower(v_titulo_limpio), '[^a-z0-9]+', '', 'g');
    IF v_norm_desc <> '' AND v_norm_desc = v_norm_title THEN
      v_descripcion_final := v_descripcion_limpia;
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
      updated_at = timezone('utc'::text, now())
    WHERE id = v_pr.id;
  END IF;

  RETURN v_tasaciones_remate_id;
END;
$$;

-- Limpieza defensiva para registros ya contaminados por concatenación repetida.
UPDATE public.remates r
SET descripcion = NULLIF(
  trim(
    regexp_replace(
      regexp_replace(
        COALESCE(r.descripcion, ''),
        '((?i:remate\\s*#?\\s*\\d{3,6})\\s*-\\s*){2,}',
        '\\2 - ',
        'g'
      ),
      '\\s{2,}',
      ' ',
      'g'
    )
  ),
  ''
)
WHERE EXISTS (
  SELECT 1
  FROM public.portal_remates pr
  WHERE pr.tasaciones_remate_id = r.id
);

