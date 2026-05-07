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
    CHECK (estado IN ('pendiente', 'activo', 'vendido', 'anulado'))
);

CREATE TABLE IF NOT EXISTS public.portal_ofertas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  lote_id UUID NOT NULL REFERENCES public.portal_remate_lotes (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  monto NUMERIC NOT NULL CHECK (monto > 0)
);

CREATE INDEX IF NOT EXISTS idx_portal_remate_lotes_remate ON public.portal_remate_lotes (remate_id);
CREATE INDEX IF NOT EXISTS idx_portal_ofertas_lote ON public.portal_ofertas (lote_id);
CREATE INDEX IF NOT EXISTS idx_portal_ofertas_created ON public.portal_ofertas (created_at DESC);

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

CREATE OR REPLACE FUNCTION public.portal_place_bid(p_lote_id UUID, p_monto NUMERIC)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_remate public.portal_remates%ROWTYPE;
  v_lote public.portal_remate_lotes%ROWTYPE;
  v_max NUMERIC;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'debes_iniciar_sesion');
  END IF;

  IF p_monto IS NULL OR p_monto <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'monto_invalido');
  END IF;

  SELECT * INTO v_lote FROM public.portal_remate_lotes WHERE id = p_lote_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'lote_no_existe');
  END IF;

  SELECT * INTO v_remate FROM public.portal_remates WHERE id = v_lote.remate_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'remate_no_existe');
  END IF;

  IF v_remate.estado <> 'en_curso' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'remate_no_esta_en_curso');
  END IF;

  IF timezone('utc'::text, now()) > v_remate.ends_at THEN
    RETURN jsonb_build_object('ok', false, 'error', 'remate_ya_finalizo');
  END IF;

  IF v_remate.starts_at IS NOT NULL AND timezone('utc'::text, now()) < v_remate.starts_at THEN
    RETURN jsonb_build_object('ok', false, 'error', 'remate_aun_no_inicia');
  END IF;

  SELECT COALESCE(MAX(o.monto), 0) INTO v_max
  FROM public.portal_ofertas o
  WHERE o.lote_id = p_lote_id;

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
    IF p_monto < v_max + v_lote.incremento_minimo THEN
      RETURN jsonb_build_object(
        'ok',
        false,
        'error',
        'monto_inferior_al_minimo_siguiente',
        'minimo_requerido',
        v_max + v_lote.incremento_minimo
      );
    END IF;
  END IF;

  INSERT INTO public.portal_ofertas (lote_id, user_id, monto)
  VALUES (p_lote_id, v_uid, p_monto);

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.portal_place_bid(UUID, NUMERIC) TO authenticated;

COMMENT ON TABLE public.portal_remates IS 'Remates/subastas del portal vedisaremates (comparte auth con Tasaciones)';
COMMENT ON FUNCTION public.portal_place_bid(UUID, NUMERIC) IS 'Registra oferta con bloqueo de fila; cliente autenticado';

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
