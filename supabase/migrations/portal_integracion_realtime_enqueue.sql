-- Mejora de tiempo real para integracion Tasaciones <-> Portal Remates.
-- Problema: los triggers encolan eventos, pero si el worker no se invoca
-- regularmente, la cola queda pendiente y no se ve reflejado en segundos.
-- Solucion: mantener outbox + retries, pero disparar un procesamiento
-- inmediato (best-effort) despues de encolar.

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

  -- No bloquea la transaccion de origen: si falla el procesamiento inmediato,
  -- el evento queda pending y el worker puede reintentar despues.
  BEGIN
    PERFORM public.portal_integracion_procesar_outbox(50);
  EXCEPTION
    WHEN OTHERS THEN
      NULL;
  END;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.portal_integracion_enqueue(TEXT, TEXT, TEXT, JSONB) TO authenticated;
