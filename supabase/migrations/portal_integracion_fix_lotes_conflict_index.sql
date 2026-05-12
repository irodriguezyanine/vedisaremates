-- Fix 42P10 en sync de lotes Tasaciones -> Portal:
-- ON CONFLICT (tasaciones_remate_item_id) requiere un UNIQUE inferible.

-- 1) Limpieza de duplicados no nulos: mantenemos el registro mas reciente
-- y despejamos el mapping en los restantes para habilitar UNIQUE.
WITH ranked AS (
  SELECT
    id,
    tasaciones_remate_item_id,
    row_number() OVER (
      PARTITION BY tasaciones_remate_item_id
      ORDER BY created_at DESC NULLS LAST, id DESC
    ) AS rn
  FROM public.portal_remate_lotes
  WHERE tasaciones_remate_item_id IS NOT NULL
)
UPDATE public.portal_remate_lotes prl
SET
  tasaciones_remate_item_id = NULL
FROM ranked r
WHERE prl.id = r.id
  AND r.rn > 1;

-- 2) Reemplazamos indice previo por UNIQUE no parcial.
DROP INDEX IF EXISTS idx_portal_remate_lotes_tasaciones_item_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_portal_remate_lotes_tasaciones_item_id
  ON public.portal_remate_lotes (tasaciones_remate_item_id);
