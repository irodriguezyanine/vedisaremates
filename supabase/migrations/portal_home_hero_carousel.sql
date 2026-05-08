-- Carrusel de banners del inicio (4 imágenes), editable por admin.
-- Ejecutá en SQL Editor después de tener auth_user_es_admin().

CREATE TABLE IF NOT EXISTS public.portal_home_hero (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  slides JSONB NOT NULL DEFAULT '[]'::jsonb,
  CONSTRAINT portal_home_hero_slides_check CHECK (
    jsonb_typeof(slides) = 'array'
  )
);

DROP TRIGGER IF EXISTS portal_home_hero_updated_at ON public.portal_home_hero;
CREATE TRIGGER portal_home_hero_updated_at
  BEFORE UPDATE ON public.portal_home_hero
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.portal_home_hero ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS portal_home_hero_select_public ON public.portal_home_hero;
CREATE POLICY portal_home_hero_select_public
  ON public.portal_home_hero FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS portal_home_hero_insert_admin ON public.portal_home_hero;
CREATE POLICY portal_home_hero_insert_admin
  ON public.portal_home_hero FOR INSERT
  TO authenticated
  WITH CHECK (public.auth_user_es_admin() AND id = 1);

DROP POLICY IF EXISTS portal_home_hero_update_admin ON public.portal_home_hero;
CREATE POLICY portal_home_hero_update_admin
  ON public.portal_home_hero FOR UPDATE
  TO authenticated
  USING (public.auth_user_es_admin() AND id = 1)
  WITH CHECK (public.auth_user_es_admin() AND id = 1);

COMMENT ON TABLE public.portal_home_hero IS 'Banners del carrusel del home (JSON array {src,href,alt})';

-- Fila inicial: evita 404 en cliente si la tabla fue creada sin datos (HeroCarousel puede consultar antes de “Personalizar”).
INSERT INTO public.portal_home_hero (id, slides)
VALUES (1, '[]'::jsonb)
ON CONFLICT (id) DO NOTHING;
