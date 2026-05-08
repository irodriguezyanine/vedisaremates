-- Perfil de participante: listado de ofertas propias y actualización de nombre visible.
-- Ejecutar después de portal_subastas_vedisaremates.sql (requiere tablas portal_* y public.profiles).

CREATE OR REPLACE FUNCTION public.portal_listar_mis_ofertas()
RETURNS TABLE (
  oferta_id UUID,
  created_at TIMESTAMPTZ,
  monto NUMERIC,
  lote_id UUID,
  lote_titulo TEXT,
  remate_id UUID,
  remate_titulo TEXT,
  remate_estado TEXT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    o.id,
    o.created_at,
    o.monto,
    l.id,
    COALESCE(NULLIF(trim(l.titulo), ''), 'Lote'),
    r.id,
    r.titulo,
    r.estado
  FROM public.portal_ofertas o
  JOIN public.portal_remate_lotes l ON l.id = o.lote_id
  JOIN public.portal_remates r ON r.id = l.remate_id
  WHERE o.user_id = auth.uid()
  ORDER BY o.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.portal_listar_mis_ofertas() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portal_listar_mis_ofertas() TO authenticated;

CREATE OR REPLACE FUNCTION public.portal_update_mi_nombre(p_nombre TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sin_sesion');
  END IF;

  UPDATE public.profiles
  SET nombre = NULLIF(trim(p_nombre), '')
  WHERE id = auth.uid();

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.portal_update_mi_nombre(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portal_update_mi_nombre(TEXT) TO authenticated;

COMMENT ON FUNCTION public.portal_listar_mis_ofertas() IS 'Historial de ofertas del usuario autenticado (portal remates)';
COMMENT ON FUNCTION public.portal_update_mi_nombre(TEXT) IS 'Actualiza nombre visible del perfil del usuario autenticado';
