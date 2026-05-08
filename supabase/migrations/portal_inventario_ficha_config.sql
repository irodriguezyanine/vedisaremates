-- Configuración editable (admin) para títulos, visibilidad, orden y agrupación en la ficha pública inventario/remate.

CREATE TABLE IF NOT EXISTS public.portal_inventario_ficha_config (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  config JSONB NOT NULL DEFAULT '{"version":1}'::jsonb,
  CONSTRAINT portal_inventario_ficha_config_cfg_check CHECK (jsonb_typeof(config) = 'object')
);

DROP TRIGGER IF EXISTS portal_inventario_ficha_cfg_updated ON public.portal_inventario_ficha_config;
CREATE TRIGGER portal_inventario_ficha_cfg_updated
  BEFORE UPDATE ON public.portal_inventario_ficha_config
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.portal_inventario_ficha_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS portal_inv_ficha_cfg_select_public ON public.portal_inventario_ficha_config;
CREATE POLICY portal_inv_ficha_cfg_select_public
  ON public.portal_inventario_ficha_config FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS portal_inv_ficha_cfg_insert_admin ON public.portal_inventario_ficha_config;
CREATE POLICY portal_inv_ficha_cfg_insert_admin
  ON public.portal_inventario_ficha_config FOR INSERT
  TO authenticated
  WITH CHECK (public.auth_user_es_admin() AND id = 1);

DROP POLICY IF EXISTS portal_inv_ficha_cfg_update_admin ON public.portal_inventario_ficha_config;
CREATE POLICY portal_inv_ficha_cfg_update_admin
  ON public.portal_inventario_ficha_config FOR UPDATE
  TO authenticated
  USING (public.auth_user_es_admin() AND id = 1)
  WITH CHECK (public.auth_user_es_admin() AND id = 1);

COMMENT ON TABLE public.portal_inventario_ficha_config IS 'Personalización de ficha técnica pública ({version, fieldOverrides, sectionOrder, portalBannerHiddenKeys}).';

INSERT INTO public.portal_inventario_ficha_config (id, config)
VALUES (1, '{"version":1}'::jsonb)
ON CONFLICT (id) DO NOTHING;
