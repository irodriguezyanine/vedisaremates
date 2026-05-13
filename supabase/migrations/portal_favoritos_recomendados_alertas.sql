-- Favoritos de lotes + recomendacion de proximo remate + log de alertas por correo.

CREATE TABLE IF NOT EXISTS public.portal_lote_favoritos (
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  lote_id UUID NOT NULL REFERENCES public.portal_remate_lotes (id) ON DELETE CASCADE,
  notify_email BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (user_id, lote_id)
);

CREATE INDEX IF NOT EXISTS idx_portal_lote_favoritos_lote_id
  ON public.portal_lote_favoritos (lote_id);

CREATE TABLE IF NOT EXISTS public.portal_favorito_alertas_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  lote_id UUID NOT NULL REFERENCES public.portal_remate_lotes (id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE (user_id, lote_id, alert_type)
);

ALTER TABLE public.portal_lote_favoritos ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'portal_lote_favoritos'
      AND policyname = 'portal_lote_favoritos_owner_select'
  ) THEN
    CREATE POLICY portal_lote_favoritos_owner_select
      ON public.portal_lote_favoritos
      FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'portal_lote_favoritos'
      AND policyname = 'portal_lote_favoritos_owner_insert'
  ) THEN
    CREATE POLICY portal_lote_favoritos_owner_insert
      ON public.portal_lote_favoritos
      FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'portal_lote_favoritos'
      AND policyname = 'portal_lote_favoritos_owner_update'
  ) THEN
    CREATE POLICY portal_lote_favoritos_owner_update
      ON public.portal_lote_favoritos
      FOR UPDATE
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'portal_lote_favoritos'
      AND policyname = 'portal_lote_favoritos_owner_delete'
  ) THEN
    CREATE POLICY portal_lote_favoritos_owner_delete
      ON public.portal_lote_favoritos
      FOR DELETE
      USING (auth.uid() = user_id);
  END IF;
END$$;

CREATE OR REPLACE FUNCTION public.portal_recomendar_proximo_remate()
RETURNS TABLE (
  remate_id UUID,
  titulo TEXT,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  score INT,
  motivo TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH user_pref AS (
    SELECT
      lower(COALESCE(i.marca, '')) AS marca_norm,
      lower(COALESCE(i.modelo, '')) AS modelo_norm,
      COUNT(*)::INT AS cnt
    FROM public.portal_ofertas o
    JOIN public.portal_remate_lotes l ON l.id = o.lote_id
    LEFT JOIN public.inventario i ON i.id = l.inventario_id
    WHERE o.user_id = v_uid
      AND COALESCE(i.marca, '') <> ''
      AND COALESCE(i.modelo, '') <> ''
    GROUP BY 1, 2
  ),
  candidate AS (
    SELECT
      r.id AS remate_id,
      r.titulo,
      r.starts_at,
      r.ends_at,
      SUM(COALESCE(up.cnt, 0))::INT AS score,
      MAX(i.marca) FILTER (WHERE up.cnt IS NOT NULL) AS match_marca,
      MAX(i.modelo) FILTER (WHERE up.cnt IS NOT NULL) AS match_modelo
    FROM public.portal_remates r
    JOIN public.portal_remate_lotes l ON l.remate_id = r.id
    LEFT JOIN public.inventario i ON i.id = l.inventario_id
    LEFT JOIN user_pref up
      ON up.marca_norm = lower(COALESCE(i.marca, ''))
     AND up.modelo_norm = lower(COALESCE(i.modelo, ''))
    WHERE r.estado IN ('publicado', 'en_curso')
      AND r.ends_at > timezone('utc'::text, now())
    GROUP BY r.id, r.titulo, r.starts_at, r.ends_at
  )
  SELECT
    c.remate_id,
    c.titulo,
    c.starts_at,
    c.ends_at,
    c.score,
    CASE
      WHEN c.score > 0 AND c.match_marca IS NOT NULL AND c.match_modelo IS NOT NULL
        THEN format('Basado en tu historial: %s %s', c.match_marca, c.match_modelo)
      WHEN c.score > 0
        THEN 'Basado en tu historial reciente de ofertas'
      ELSE 'Recomendado por proximidad de inicio'
    END AS motivo
  FROM candidate c
  ORDER BY c.score DESC, COALESCE(c.starts_at, c.ends_at) ASC
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.portal_recomendar_proximo_remate() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portal_recomendar_proximo_remate() TO authenticated;

