-- Usa ventana explícita de inicio/cierre desde Tasaciones cuando exista.
-- Fallback: mantiene lógica histórica con fecha_hora_remate y duración configurable.

ALTER TABLE public.remates
  ADD COLUMN IF NOT EXISTS fecha_hora_inicio TIMESTAMPTZ;

ALTER TABLE public.remates
  ADD COLUMN IF NOT EXISTS fecha_hora_cierre TIMESTAMPTZ;

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
  v_starts_at := COALESCE(
    v_r.fecha_hora_inicio,
    v_ends_at - make_interval(hours => COALESCE(v_duration_hours, 24))
  );
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
