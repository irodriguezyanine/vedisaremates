-- Fix 42P10 en sincronizacion Tasaciones -> Portal:
-- ON CONFLICT (tasaciones_remate_id) requiere un indice/constraint UNIQUE
-- inferible sobre esa columna.

-- 1) Si existen duplicados no nulos, conservamos el mas reciente y
-- despejamos el mapping en los restantes para poder crear el UNIQUE.
WITH ranked AS (
  SELECT
    id,
    tasaciones_remate_id,
    row_number() OVER (
      PARTITION BY tasaciones_remate_id
      ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
    ) AS rn
  FROM public.portal_remates
  WHERE tasaciones_remate_id IS NOT NULL
)
UPDATE public.portal_remates pr
SET
  tasaciones_remate_id = NULL,
  updated_at = timezone('utc'::text, now())
FROM ranked r
WHERE pr.id = r.id
  AND r.rn > 1;

-- 2) Reemplazamos el indice previo (si existe) por uno UNIQUE no parcial.
-- Nota: PostgreSQL permite multiples NULL en UNIQUE, por eso no necesitamos
-- indice parcial y ON CONFLICT puede inferirlo correctamente.
DROP INDEX IF EXISTS idx_portal_remates_tasaciones_remate_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_portal_remates_tasaciones_remate_id
  ON public.portal_remates (tasaciones_remate_id);
