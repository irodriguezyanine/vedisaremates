-- =============================================================================
-- Portal VEDISA Remates — subastas en línea (tablas nuevas en la MISMA Supabase
-- que Tasaciones Vedisa). Ejecutar en SQL Editor del proyecto Supabase.
-- Requiere: public.profiles, public.inventario, public.auth_user_es_admin()
-- y public.set_updated_at() (migraciones Tasaciones).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.portal_remates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  titulo TEXT NOT NULL,
  descripcion TEXT,
  estado TEXT NOT NULL DEFAULT 'borrador'
    CHECK (estado IN ('borrador', 'publicado', 'en_curso', 'cerrado')),
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ NOT NULL,
  created_by UUID REFERENCES auth.users (id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.portal_remate_lotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  remate_id UUID NOT NULL REFERENCES public.portal_remates (id) ON DELETE CASCADE,
  inventario_id UUID REFERENCES public.inventario (id) ON DELETE SET NULL,
  orden INT NOT NULL DEFAULT 0,
  titulo TEXT,
  descripcion TEXT,
  precio_base NUMERIC NOT NULL DEFAULT 0 CHECK (precio_base >= 0),
  incremento_minimo NUMERIC NOT NULL DEFAULT 50000 CHECK (incremento_minimo > 0),
  estado TEXT NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente', 'activo', 'pausado', 'adjudicado', 'vendido', 'anulado'))
);

CREATE TABLE IF NOT EXISTS public.portal_ofertas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  lote_id UUID NOT NULL REFERENCES public.portal_remate_lotes (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  monto NUMERIC NOT NULL CHECK (monto > 0)
);

CREATE TABLE IF NOT EXISTS public.portal_remates_config (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  anti_sniping_enabled BOOLEAN NOT NULL DEFAULT true,
  anti_sniping_window_seconds INT NOT NULL DEFAULT 120 CHECK (anti_sniping_window_seconds >= 0),
  anti_sniping_extend_seconds INT NOT NULL DEFAULT 120 CHECK (anti_sniping_extend_seconds >= 0),
  high_bid_confirm_multiplier NUMERIC NOT NULL DEFAULT 3 CHECK (high_bid_confirm_multiplier >= 1),
  max_bids_per_minute INT NOT NULL DEFAULT 25 CHECK (max_bids_per_minute >= 1),
  suspicious_raise_multiplier NUMERIC NOT NULL DEFAULT 5 CHECK (suspicious_raise_multiplier >= 1),
  last_minutes_notice_seconds INT NOT NULL DEFAULT 300 CHECK (last_minutes_notice_seconds >= 0),
  tie_breaker_mode TEXT NOT NULL DEFAULT 'earliest' CHECK (tie_breaker_mode IN ('earliest', 'latest')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_by UUID REFERENCES auth.users (id) ON DELETE SET NULL
);

ALTER TABLE public.portal_remates_config ADD COLUMN IF NOT EXISTS high_bid_confirm_multiplier NUMERIC NOT NULL DEFAULT 3;
ALTER TABLE public.portal_remates_config ADD COLUMN IF NOT EXISTS max_bids_per_minute INT NOT NULL DEFAULT 25;
ALTER TABLE public.portal_remates_config ADD COLUMN IF NOT EXISTS suspicious_raise_multiplier NUMERIC NOT NULL DEFAULT 5;
ALTER TABLE public.portal_remates_config ADD COLUMN IF NOT EXISTS last_minutes_notice_seconds INT NOT NULL DEFAULT 300;
ALTER TABLE public.portal_remates_config ADD COLUMN IF NOT EXISTS tie_breaker_mode TEXT NOT NULL DEFAULT 'earliest';

ALTER TABLE public.portal_remate_lotes
  ADD COLUMN IF NOT EXISTS precio_reserva NUMERIC CHECK (precio_reserva IS NULL OR precio_reserva >= 0);

ALTER TABLE public.portal_remate_lotes DROP CONSTRAINT IF EXISTS portal_remate_lotes_estado_check;
ALTER TABLE public.portal_remate_lotes
  ADD CONSTRAINT portal_remate_lotes_estado_check
  CHECK (estado IN ('pendiente', 'activo', 'pausado', 'adjudicado', 'vendido', 'anulado'));

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS garantia_aprobada BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS garantia_aprobada_at TIMESTAMPTZ;
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS garantia_aprobada_by UUID REFERENCES auth.users (id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.portal_bid_increment_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  remate_id UUID REFERENCES public.portal_remates (id) ON DELETE CASCADE,
  min_monto NUMERIC NOT NULL DEFAULT 0 CHECK (min_monto >= 0),
  incremento NUMERIC NOT NULL CHECK (incremento > 0),
  enabled BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.portal_proxy_bids (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  lote_id UUID NOT NULL REFERENCES public.portal_remate_lotes (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  max_monto NUMERIC NOT NULL CHECK (max_monto > 0),
  active BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (lote_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.portal_ofertas_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  oferta_id UUID NOT NULL REFERENCES public.portal_ofertas (id) ON DELETE CASCADE,
  lote_id UUID NOT NULL REFERENCES public.portal_remate_lotes (id) ON DELETE CASCADE,
  remate_id UUID NOT NULL REFERENCES public.portal_remates (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  monto NUMERIC NOT NULL,
  user_agent TEXT,
  client_meta JSONB,
  is_auto_bid BOOLEAN NOT NULL DEFAULT false,
  suspicious BOOLEAN NOT NULL DEFAULT false,
  suspicious_reason TEXT
);

CREATE TABLE IF NOT EXISTS public.portal_lote_eventos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  remate_id UUID NOT NULL REFERENCES public.portal_remates (id) ON DELETE CASCADE,
  lote_id UUID NOT NULL REFERENCES public.portal_remate_lotes (id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  detalle JSONB,
  created_by UUID REFERENCES auth.users (id) ON DELETE SET NULL
);

CREATE OR REPLACE FUNCTION public.portal_log_lote_eventos_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.estado IS DISTINCT FROM OLD.estado THEN
      INSERT INTO public.portal_lote_eventos (remate_id, lote_id, event_type, detalle, created_by)
      VALUES (NEW.remate_id, NEW.id, 'estado_lote', jsonb_build_object('from', OLD.estado, 'to', NEW.estado), auth.uid());
    END IF;
    IF NEW.precio_reserva IS DISTINCT FROM OLD.precio_reserva THEN
      INSERT INTO public.portal_lote_eventos (remate_id, lote_id, event_type, detalle, created_by)
      VALUES (
        NEW.remate_id,
        NEW.id,
        'precio_reserva',
        jsonb_build_object('from', OLD.precio_reserva, 'to', NEW.precio_reserva),
        auth.uid()
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS portal_lote_eventos_trigger ON public.portal_remate_lotes;
CREATE TRIGGER portal_lote_eventos_trigger
AFTER UPDATE ON public.portal_remate_lotes
FOR EACH ROW
EXECUTE FUNCTION public.portal_log_lote_eventos_trigger();

CREATE INDEX IF NOT EXISTS idx_portal_remate_lotes_remate ON public.portal_remate_lotes (remate_id);
CREATE INDEX IF NOT EXISTS idx_portal_ofertas_lote ON public.portal_ofertas (lote_id);
CREATE INDEX IF NOT EXISTS idx_portal_ofertas_created ON public.portal_ofertas (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_portal_ofertas_audit_remate_created ON public.portal_ofertas_audit (remate_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_portal_lote_eventos_lote_created ON public.portal_lote_eventos (lote_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_portal_increment_rules_scope ON public.portal_bid_increment_rules (remate_id, min_monto DESC);
CREATE INDEX IF NOT EXISTS idx_portal_proxy_bids_lote_active ON public.portal_proxy_bids (lote_id, active);

INSERT INTO public.portal_remates_config (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

DROP TRIGGER IF EXISTS portal_remates_updated_at ON public.portal_remates;
CREATE TRIGGER portal_remates_updated_at
  BEFORE UPDATE ON public.portal_remates
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'portal_ofertas'
    ) THEN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.portal_ofertas';
    END IF;
  END IF;
END $$;

ALTER TABLE public.portal_remates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_remate_lotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_ofertas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_remates_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_bid_increment_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_proxy_bids ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_ofertas_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_lote_eventos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS portal_remates_select_public ON public.portal_remates;
CREATE POLICY portal_remates_select_public
  ON public.portal_remates FOR SELECT
  TO anon, authenticated
  USING (
    estado IN ('publicado', 'en_curso', 'cerrado')
    OR public.auth_user_es_admin()
  );

DROP POLICY IF EXISTS portal_remates_insert_admin ON public.portal_remates;
CREATE POLICY portal_remates_insert_admin
  ON public.portal_remates FOR INSERT
  TO authenticated
  WITH CHECK (public.auth_user_es_admin());

DROP POLICY IF EXISTS portal_remates_update_admin ON public.portal_remates;
CREATE POLICY portal_remates_update_admin
  ON public.portal_remates FOR UPDATE
  TO authenticated
  USING (public.auth_user_es_admin())
  WITH CHECK (public.auth_user_es_admin());

DROP POLICY IF EXISTS portal_remates_delete_admin ON public.portal_remates;
CREATE POLICY portal_remates_delete_admin
  ON public.portal_remates FOR DELETE
  TO authenticated
  USING (public.auth_user_es_admin());

DROP POLICY IF EXISTS portal_lotes_select ON public.portal_remate_lotes;
CREATE POLICY portal_lotes_select
  ON public.portal_remate_lotes FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.portal_remates r
      WHERE r.id = portal_remate_lotes.remate_id
        AND (
          r.estado IN ('publicado', 'en_curso', 'cerrado')
          OR public.auth_user_es_admin()
        )
    )
  );

DROP POLICY IF EXISTS portal_lotes_insert_admin ON public.portal_remate_lotes;
CREATE POLICY portal_lotes_insert_admin
  ON public.portal_remate_lotes FOR INSERT
  TO authenticated
  WITH CHECK (public.auth_user_es_admin());

DROP POLICY IF EXISTS portal_lotes_update_admin ON public.portal_remate_lotes;
CREATE POLICY portal_lotes_update_admin
  ON public.portal_remate_lotes FOR UPDATE
  TO authenticated
  USING (public.auth_user_es_admin())
  WITH CHECK (public.auth_user_es_admin());

DROP POLICY IF EXISTS portal_lotes_delete_admin ON public.portal_remate_lotes;
CREATE POLICY portal_lotes_delete_admin
  ON public.portal_remate_lotes FOR DELETE
  TO authenticated
  USING (public.auth_user_es_admin());

DROP POLICY IF EXISTS portal_ofertas_select ON public.portal_ofertas;
CREATE POLICY portal_ofertas_select
  ON public.portal_ofertas FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.portal_remate_lotes l
      JOIN public.portal_remates r ON r.id = l.remate_id
      WHERE l.id = portal_ofertas.lote_id
        AND (
          r.estado IN ('publicado', 'en_curso', 'cerrado')
          OR public.auth_user_es_admin()
        )
    )
  );

DROP POLICY IF EXISTS portal_remates_config_select_admin ON public.portal_remates_config;
CREATE POLICY portal_remates_config_select_admin
  ON public.portal_remates_config FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS portal_remates_config_update_admin ON public.portal_remates_config;
CREATE POLICY portal_remates_config_update_admin
  ON public.portal_remates_config FOR UPDATE
  TO authenticated
  USING (public.auth_user_es_admin())
  WITH CHECK (public.auth_user_es_admin());

DROP POLICY IF EXISTS portal_increment_rules_select ON public.portal_bid_increment_rules;
CREATE POLICY portal_increment_rules_select
  ON public.portal_bid_increment_rules FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS portal_increment_rules_mutate_admin ON public.portal_bid_increment_rules;
CREATE POLICY portal_increment_rules_mutate_admin
  ON public.portal_bid_increment_rules FOR ALL
  TO authenticated
  USING (public.auth_user_es_admin())
  WITH CHECK (public.auth_user_es_admin());

DROP POLICY IF EXISTS portal_proxy_select_owner_admin ON public.portal_proxy_bids;
CREATE POLICY portal_proxy_select_owner_admin
  ON public.portal_proxy_bids FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.auth_user_es_admin());

DROP POLICY IF EXISTS portal_proxy_insert_owner ON public.portal_proxy_bids;
CREATE POLICY portal_proxy_insert_owner
  ON public.portal_proxy_bids FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS portal_proxy_update_owner ON public.portal_proxy_bids;
CREATE POLICY portal_proxy_update_owner
  ON public.portal_proxy_bids FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() OR public.auth_user_es_admin())
  WITH CHECK (user_id = auth.uid() OR public.auth_user_es_admin());

DROP POLICY IF EXISTS portal_proxy_delete_owner ON public.portal_proxy_bids;
CREATE POLICY portal_proxy_delete_owner
  ON public.portal_proxy_bids FOR DELETE
  TO authenticated
  USING (user_id = auth.uid() OR public.auth_user_es_admin());

DROP POLICY IF EXISTS portal_ofertas_audit_admin_only ON public.portal_ofertas_audit;
CREATE POLICY portal_ofertas_audit_admin_only
  ON public.portal_ofertas_audit FOR SELECT
  TO authenticated
  USING (public.auth_user_es_admin());

DROP POLICY IF EXISTS portal_lote_eventos_admin_only ON public.portal_lote_eventos;
CREATE POLICY portal_lote_eventos_admin_only
  ON public.portal_lote_eventos FOR SELECT
  TO authenticated
  USING (public.auth_user_es_admin());

CREATE OR REPLACE FUNCTION public.portal_get_incremento_siguiente(
  p_remate_id UUID,
  p_monto_actual NUMERIC,
  p_incremento_base NUMERIC
)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT r.incremento
      FROM public.portal_bid_increment_rules r
      WHERE r.enabled = true
        AND (r.remate_id = p_remate_id OR r.remate_id IS NULL)
        AND r.min_monto <= COALESCE(p_monto_actual, 0)
      ORDER BY (r.remate_id = p_remate_id) DESC, r.min_monto DESC
      LIMIT 1
    ),
    GREATEST(COALESCE(p_incremento_base, 0), 1)
  );
$$;

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
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'debes_iniciar_sesion');
  END IF;

  IF p_max_monto IS NULL OR p_max_monto <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'monto_invalido');
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

DROP FUNCTION IF EXISTS public.portal_place_bid(UUID, NUMERIC);
CREATE OR REPLACE FUNCTION public.portal_place_bid(p_lote_id UUID, p_monto NUMERIC, p_client_meta JSONB DEFAULT '{}'::jsonb)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_now TIMESTAMPTZ := timezone('utc'::text, now());
  v_remate public.portal_remates%ROWTYPE;
  v_lote public.portal_remate_lotes%ROWTYPE;
  v_profile public.profiles%ROWTYPE;
  v_cfg public.portal_remates_config%ROWTYPE;
  v_max NUMERIC;
  v_max_uid UUID;
  v_inc NUMERIC;
  v_required_min NUMERIC;
  v_extended_to TIMESTAMPTZ;
  v_remaining_secs INT;
  v_bid_id UUID;
  v_suspicious BOOLEAN := false;
  v_suspicious_reason TEXT := null;
  v_my_bids_last_min INT := 0;
  v_auto_loop_guard INT := 0;
  v_challenger RECORD;
  v_leader_proxy NUMERIC;
  v_next_amount NUMERIC;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'debes_iniciar_sesion');
  END IF;

  IF p_monto IS NULL OR p_monto <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'monto_invalido');
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = v_uid;
  IF NOT FOUND OR COALESCE(v_profile.garantia_aprobada, false) = false THEN
    RETURN jsonb_build_object('ok', false, 'error', 'garantia_no_habilitada');
  END IF;

  SELECT * INTO v_lote FROM public.portal_remate_lotes WHERE id = p_lote_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'lote_no_existe');
  END IF;

  IF v_lote.estado IN ('anulado', 'vendido', 'adjudicado', 'pausado') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'lote_no_habilitado');
  END IF;

  SELECT * INTO v_remate FROM public.portal_remates WHERE id = v_lote.remate_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'remate_no_existe');
  END IF;

  IF v_remate.estado NOT IN ('en_curso', 'publicado') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'remate_no_esta_en_curso');
  END IF;

  IF v_now > v_remate.ends_at THEN
    RETURN jsonb_build_object('ok', false, 'error', 'remate_ya_finalizo');
  END IF;

  IF v_remate.starts_at IS NOT NULL AND v_now < v_remate.starts_at THEN
    RETURN jsonb_build_object('ok', false, 'error', 'remate_aun_no_inicia');
  END IF;

  SELECT COALESCE(MAX(o.monto), 0) INTO v_max
  FROM public.portal_ofertas o
  WHERE o.lote_id = p_lote_id;
  SELECT o.user_id
    INTO v_max_uid
  FROM public.portal_ofertas o
  WHERE o.lote_id = p_lote_id
  ORDER BY o.monto DESC, o.created_at DESC
  LIMIT 1;

  SELECT * INTO v_cfg FROM public.portal_remates_config WHERE id = 1;
  IF NOT FOUND THEN
    v_cfg.id := 1;
    v_cfg.anti_sniping_enabled := true;
    v_cfg.anti_sniping_window_seconds := 120;
    v_cfg.anti_sniping_extend_seconds := 120;
    v_cfg.high_bid_confirm_multiplier := 3;
    v_cfg.max_bids_per_minute := 25;
    v_cfg.suspicious_raise_multiplier := 5;
    v_cfg.last_minutes_notice_seconds := 300;
    v_cfg.tie_breaker_mode := 'earliest';
  END IF;

  SELECT COUNT(*) INTO v_my_bids_last_min
  FROM public.portal_ofertas
  WHERE lote_id = p_lote_id
    AND user_id = v_uid
    AND created_at >= (v_now - interval '1 minute');
  IF v_my_bids_last_min >= v_cfg.max_bids_per_minute THEN
    RETURN jsonb_build_object('ok', false, 'error', 'limite_frecuencia_pujas');
  END IF;

  v_inc := public.portal_get_incremento_siguiente(v_remate.id, v_max, v_lote.incremento_minimo);

  IF COALESCE(v_max, 0) = 0 THEN
    IF p_monto < v_lote.precio_base THEN
      RETURN jsonb_build_object(
        'ok',
        false,
        'error',
        'primera_oferta_debe_superar_precio_base',
        'precio_base',
        v_lote.precio_base
      );
    END IF;
  ELSE
    IF v_max_uid = v_uid THEN
      RETURN jsonb_build_object('ok', false, 'error', 'ya_eres_mejor_postor');
    END IF;
    v_required_min := v_max + v_inc;
    IF p_monto < v_required_min THEN
      RETURN jsonb_build_object(
        'ok',
        false,
        'error',
        'monto_inferior_al_minimo_siguiente',
        'minimo_requerido',
        v_required_min
      );
    END IF;
  END IF;

  IF v_max > 0 AND p_monto >= v_max * v_cfg.suspicious_raise_multiplier THEN
    v_suspicious := true;
    v_suspicious_reason := 'salto_fuera_de_rango';
  END IF;

  IF v_lote.precio_reserva IS NOT NULL AND p_monto < v_lote.precio_reserva THEN
    -- permitido ofertar bajo reserva; admin verá estado de reserva no alcanzada
    NULL;
  END IF;

  INSERT INTO public.portal_ofertas (lote_id, user_id, monto)
  VALUES (p_lote_id, v_uid, p_monto)
  RETURNING id INTO v_bid_id;

  INSERT INTO public.portal_ofertas_audit (
    oferta_id, lote_id, remate_id, user_id, monto, user_agent, client_meta, is_auto_bid, suspicious, suspicious_reason
  )
  VALUES (
    v_bid_id,
    p_lote_id,
    v_remate.id,
    v_uid,
    p_monto,
    COALESCE(p_client_meta->>'userAgent', ''),
    p_client_meta,
    false,
    v_suspicious,
    v_suspicious_reason
  );

  INSERT INTO public.portal_lote_eventos (remate_id, lote_id, event_type, detalle, created_by)
  VALUES (
    v_remate.id,
    p_lote_id,
    'oferta_manual',
    jsonb_build_object('monto', p_monto, 'user_id', v_uid, 'suspicious', v_suspicious),
    v_uid
  );

  -- Proxy bidding (auto-bid): compite contra topes máximos configurados.
  LOOP
    v_auto_loop_guard := v_auto_loop_guard + 1;
    EXIT WHEN v_auto_loop_guard > 25;

    SELECT COALESCE(MAX(o.monto), 0), (
      SELECT o2.user_id
      FROM public.portal_ofertas o2
      WHERE o2.lote_id = p_lote_id
      ORDER BY o2.monto DESC, o2.created_at DESC
      LIMIT 1
    )
    INTO v_max, v_max_uid
    FROM public.portal_ofertas o
    WHERE o.lote_id = p_lote_id;

    v_inc := public.portal_get_incremento_siguiente(v_remate.id, v_max, v_lote.incremento_minimo);

    SELECT pb.user_id, pb.max_monto
      INTO v_challenger
    FROM public.portal_proxy_bids pb
    WHERE pb.lote_id = p_lote_id
      AND pb.active = true
      AND pb.user_id <> v_max_uid
      AND pb.max_monto >= v_max + v_inc
    ORDER BY pb.max_monto DESC, pb.updated_at ASC
    LIMIT 1;

    EXIT WHEN v_challenger.user_id IS NULL;

    SELECT pb.max_monto
      INTO v_leader_proxy
    FROM public.portal_proxy_bids pb
    WHERE pb.lote_id = p_lote_id
      AND pb.user_id = v_max_uid
      AND pb.active = true
    LIMIT 1;

    v_next_amount := LEAST(v_challenger.max_monto, v_max + v_inc);

    IF v_leader_proxy IS NOT NULL AND v_leader_proxy >= v_next_amount + v_inc THEN
      -- el líder actual responde automáticamente
      INSERT INTO public.portal_ofertas (lote_id, user_id, monto)
      VALUES (p_lote_id, v_max_uid, LEAST(v_leader_proxy, v_next_amount + v_inc))
      RETURNING id INTO v_bid_id;

      INSERT INTO public.portal_ofertas_audit (
        oferta_id, lote_id, remate_id, user_id, monto, user_agent, client_meta, is_auto_bid, suspicious, suspicious_reason
      )
      VALUES (
        v_bid_id,
        p_lote_id,
        v_remate.id,
        v_max_uid,
        LEAST(v_leader_proxy, v_next_amount + v_inc),
        'proxy-bid',
        jsonb_build_object('mode', 'auto-counter'),
        true,
        false,
        null
      );
      CONTINUE;
    END IF;

    INSERT INTO public.portal_ofertas (lote_id, user_id, monto)
    VALUES (p_lote_id, v_challenger.user_id, v_next_amount)
    RETURNING id INTO v_bid_id;

    INSERT INTO public.portal_ofertas_audit (
      oferta_id, lote_id, remate_id, user_id, monto, user_agent, client_meta, is_auto_bid, suspicious, suspicious_reason
    )
    VALUES (
      v_bid_id,
      p_lote_id,
      v_remate.id,
      v_challenger.user_id,
      v_next_amount,
      'proxy-bid',
      jsonb_build_object('mode', 'auto'),
      true,
      false,
      null
    );
  END LOOP;

  IF v_cfg.anti_sniping_enabled AND v_cfg.anti_sniping_extend_seconds > 0 THEN
    v_remaining_secs := GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (v_remate.ends_at - v_now)))::INT);
    IF v_remaining_secs <= v_cfg.anti_sniping_window_seconds THEN
      UPDATE public.portal_remates
      SET
        ends_at = GREATEST(v_remate.ends_at, v_now) + make_interval(secs => v_cfg.anti_sniping_extend_seconds),
        updated_at = timezone('utc'::text, now())
      WHERE id = v_remate.id
      RETURNING ends_at INTO v_extended_to;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'ends_at_extendido', v_extended_to
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.portal_place_bid(UUID, NUMERIC, JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION public.portal_place_bid(p_lote_id UUID, p_monto NUMERIC)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.portal_place_bid(p_lote_id, p_monto, '{}'::jsonb);
$$;

GRANT EXECUTE ON FUNCTION public.portal_place_bid(UUID, NUMERIC) TO authenticated;

CREATE OR REPLACE FUNCTION public.portal_admin_listar_ofertas_remate(
  p_remate_id UUID,
  p_limit INT DEFAULT 1000
)
RETURNS TABLE (
  oferta_id UUID,
  fecha TIMESTAMPTZ,
  monto NUMERIC,
  lote_id UUID,
  lote_titulo TEXT,
  cliente_nombre TEXT,
  cliente_usuario TEXT,
  cliente_email TEXT,
  es_auto BOOLEAN,
  sospechosa BOOLEAN,
  motivo_sospecha TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.auth_user_es_admin() THEN
    RAISE EXCEPTION 'sin_permiso';
  END IF;

  RETURN QUERY
  SELECT
    o.id AS oferta_id,
    o.created_at AS fecha,
    o.monto,
    l.id AS lote_id,
    COALESCE(NULLIF(trim(l.titulo), ''), 'Lote') AS lote_titulo,
    COALESCE(NULLIF(trim(p.nombre), ''), 'Sin nombre') AS cliente_nombre,
    LEFT(o.user_id::text, 8) AS cliente_usuario,
    COALESCE(u.email, 'sin-email') AS cliente_email,
    COALESCE(a.is_auto_bid, false) AS es_auto,
    COALESCE(a.suspicious, false) AS sospechosa,
    a.suspicious_reason AS motivo_sospecha
  FROM public.portal_ofertas o
  JOIN public.portal_remate_lotes l ON l.id = o.lote_id
  JOIN auth.users u ON u.id = o.user_id
  LEFT JOIN public.profiles p ON p.id = o.user_id
  LEFT JOIN public.portal_ofertas_audit a ON a.oferta_id = o.id
  WHERE l.remate_id = p_remate_id
  ORDER BY o.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 1000), 10000));
END;
$$;

GRANT EXECUTE ON FUNCTION public.portal_admin_listar_ofertas_remate(UUID, INT) TO authenticated;

CREATE OR REPLACE FUNCTION public.portal_admin_kpis_remates()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_out JSONB;
BEGIN
  IF NOT public.auth_user_es_admin() THEN
    RAISE EXCEPTION 'sin_permiso';
  END IF;

  SELECT jsonb_build_object(
    'remates_activos', (SELECT COUNT(*) FROM public.portal_remates WHERE estado IN ('publicado','en_curso')),
    'lotes_activos', (SELECT COUNT(*) FROM public.portal_remate_lotes WHERE estado IN ('pendiente','activo')),
    'ofertas_24h', (SELECT COUNT(*) FROM public.portal_ofertas WHERE created_at >= timezone('utc'::text, now()) - interval '24 hours'),
    'monto_24h', (SELECT COALESCE(SUM(monto),0) FROM public.portal_ofertas WHERE created_at >= timezone('utc'::text, now()) - interval '24 hours'),
    'usuarios_con_garantia', (SELECT COUNT(*) FROM public.profiles WHERE COALESCE(garantia_aprobada,false) = true)
  )
  INTO v_out;

  RETURN COALESCE(v_out, '{}'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.portal_admin_kpis_remates() TO authenticated;

CREATE OR REPLACE FUNCTION public.portal_admin_timeline_lote(p_lote_id UUID, p_limit INT DEFAULT 500)
RETURNS TABLE (
  fecha TIMESTAMPTZ,
  evento TEXT,
  detalle JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.auth_user_es_admin() THEN
    RAISE EXCEPTION 'sin_permiso';
  END IF;

  RETURN QUERY
  SELECT e.created_at, e.event_type, e.detalle
  FROM public.portal_lote_eventos e
  WHERE e.lote_id = p_lote_id
  ORDER BY e.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 500), 5000));
END;
$$;

GRANT EXECUTE ON FUNCTION public.portal_admin_timeline_lote(UUID, INT) TO authenticated;

DROP FUNCTION IF EXISTS public.portal_admin_feed_ofertas_global(INT);
CREATE OR REPLACE FUNCTION public.portal_admin_feed_ofertas_global(p_limit INT DEFAULT 500)
RETURNS TABLE (
  oferta_id UUID,
  fecha TIMESTAMPTZ,
  remate_id UUID,
  remate_titulo TEXT,
  lote_id UUID,
  lote_titulo TEXT,
  monto NUMERIC,
  cliente_nombre TEXT,
  cliente_usuario TEXT,
  cliente_email TEXT,
  es_auto BOOLEAN,
  sospechosa BOOLEAN,
  motivo_sospecha TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.auth_user_es_admin() THEN
    RAISE EXCEPTION 'sin_permiso';
  END IF;

  RETURN QUERY
  SELECT
    o.id::uuid AS oferta_id,
    o.created_at::timestamptz AS fecha,
    r.id::uuid AS remate_id,
    r.titulo::text AS remate_titulo,
    l.id::uuid AS lote_id,
    COALESCE(NULLIF(trim(l.titulo), ''), 'Lote')::text AS lote_titulo,
    o.monto::numeric AS monto,
    COALESCE(NULLIF(trim(p.nombre), ''), 'Sin nombre')::text AS cliente_nombre,
    LEFT(o.user_id::text, 8)::text AS cliente_usuario,
    COALESCE(u.email, 'sin-email')::text AS cliente_email,
    COALESCE(a.is_auto_bid, false)::boolean AS es_auto,
    COALESCE(a.suspicious, false)::boolean AS sospechosa,
    a.suspicious_reason::text AS motivo_sospecha
  FROM public.portal_ofertas o
  JOIN public.portal_remate_lotes l ON l.id = o.lote_id
  JOIN public.portal_remates r ON r.id = l.remate_id
  JOIN auth.users u ON u.id = o.user_id
  LEFT JOIN public.profiles p ON p.id = o.user_id
  LEFT JOIN public.portal_ofertas_audit a ON a.oferta_id = o.id
  ORDER BY o.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 500), 5000));
END;
$$;

GRANT EXECUTE ON FUNCTION public.portal_admin_feed_ofertas_global(INT) TO authenticated;

COMMENT ON TABLE public.portal_remates IS 'Remates/subastas del portal vedisaremates (comparte auth con Tasaciones)';
COMMENT ON FUNCTION public.portal_place_bid(UUID, NUMERIC, JSONB) IS 'Registra oferta con bloqueo de fila; cliente autenticado';
COMMENT ON FUNCTION public.portal_place_bid(UUID, NUMERIC) IS 'Compatibilidad: reenvía a portal_place_bid(UUID, NUMERIC, JSONB).';
COMMENT ON TABLE public.portal_remates_config IS 'Configuración global de dinámica de ofertas (anti-sniping, extensión de cierre).';
COMMENT ON FUNCTION public.portal_admin_listar_ofertas_remate(UUID, INT) IS 'Admin: lista ofertas de un remate con nombre, usuario corto, email, monto y fecha.';

DROP POLICY IF EXISTS portal_inventario_select_anon_via_lotes ON public.inventario;
CREATE POLICY portal_inventario_select_anon_via_lotes
  ON public.inventario FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1
      FROM public.portal_remate_lotes pl
      JOIN public.portal_remates pr ON pr.id = pl.remate_id
      WHERE pl.inventario_id = inventario.id
        AND pr.estado IN ('publicado', 'en_curso', 'cerrado')
    )
  );
