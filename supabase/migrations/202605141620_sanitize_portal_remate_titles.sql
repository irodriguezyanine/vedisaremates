-- Capa defensiva: evita que títulos/descripciones repetidas desordenen Home/Subastas.
-- 1) Limpia registros existentes.
-- 2) Fuerza saneamiento en INSERT/UPDATE para futuras sincronizaciones.

CREATE OR REPLACE FUNCTION public.portal_integracion_sanitize_event_text(p_value TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_raw TEXT := trim(regexp_replace(COALESCE(p_value, ''), '\s+', ' ', 'g'));
  v_collapsed TEXT;
  v_part TEXT;
  v_key TEXT;
  v_seen TEXT[] := ARRAY[]::TEXT[];
  v_out TEXT := '';
  v_count INT := 0;
BEGIN
  IF v_raw = '' THEN
    RETURN NULL;
  END IF;

  -- Colapsa patrones del tipo: "Remate #00065 - Remate #00065 - ..."
  v_collapsed := regexp_replace(
    v_raw,
    '((remate\s*#?\s*[0-9]{3,6})\s*-\s*){2,}',
    '\2 - ',
    'gi'
  );

  FOR v_part IN
    SELECT trim(x)
    FROM regexp_split_to_table(v_collapsed, '\s+-\s+') AS x
    WHERE trim(x) <> ''
  LOOP
    v_key := regexp_replace(lower(v_part), '[^a-z0-9]+', '', 'g');
    IF v_key = '' THEN
      CONTINUE;
    END IF;
    IF array_position(v_seen, v_key) IS NOT NULL THEN
      CONTINUE;
    END IF;
    v_seen := array_append(v_seen, v_key);
    v_count := v_count + 1;
    v_out := CASE WHEN v_out = '' THEN v_part ELSE v_out || ' - ' || v_part END;
    EXIT WHEN v_count >= 8;
  END LOOP;

  IF v_out = '' THEN
    RETURN NULLIF(v_collapsed, '');
  END IF;
  RETURN v_out;
END;
$$;

CREATE OR REPLACE FUNCTION public.portal_integracion_tg_sanitize_portal_remates()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.titulo := public.portal_integracion_sanitize_event_text(NEW.titulo);
  NEW.descripcion := public.portal_integracion_sanitize_event_text(NEW.descripcion);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_portal_integracion_sanitize_portal_remates ON public.portal_remates;
CREATE TRIGGER trg_portal_integracion_sanitize_portal_remates
BEFORE INSERT OR UPDATE OF titulo, descripcion
ON public.portal_remates
FOR EACH ROW
EXECUTE FUNCTION public.portal_integracion_tg_sanitize_portal_remates();

UPDATE public.portal_remates
SET
  titulo = public.portal_integracion_sanitize_event_text(titulo),
  descripcion = public.portal_integracion_sanitize_event_text(descripcion)
WHERE TRUE;

