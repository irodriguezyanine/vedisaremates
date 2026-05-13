-- Exigir garantía aprobada para puja automática en cualquier remate/lote.
CREATE OR REPLACE FUNCTION public.portal_set_proxy_bid(p_lote_id UUID, p_max_monto NUMERIC)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_lote public.portal_remate_lotes%ROWTYPE;
  v_remate public.portal_remates%ROWTYPE;
  v_profile public.profiles%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'debes_iniciar_sesion');
  END IF;

  IF p_max_monto IS NULL OR p_max_monto <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'monto_invalido');
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = v_uid;
  IF NOT FOUND OR COALESCE(v_profile.garantia_aprobada, false) = false THEN
    RETURN jsonb_build_object('ok', false, 'error', 'garantia_no_habilitada');
  END IF;

  SELECT * INTO v_lote FROM public.portal_remate_lotes WHERE id = p_lote_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'lote_no_existe');
  END IF;

  SELECT * INTO v_remate FROM public.portal_remates WHERE id = v_lote.remate_id;
  IF NOT FOUND OR v_remate.estado NOT IN ('publicado', 'en_curso') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'remate_no_disponible');
  END IF;

  INSERT INTO public.portal_proxy_bids (lote_id, user_id, max_monto, active)
  VALUES (p_lote_id, v_uid, p_max_monto, true)
  ON CONFLICT (lote_id, user_id)
  DO UPDATE SET max_monto = EXCLUDED.max_monto, active = true, updated_at = timezone('utc'::text, now());

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.portal_set_proxy_bid(UUID, NUMERIC) TO authenticated;
