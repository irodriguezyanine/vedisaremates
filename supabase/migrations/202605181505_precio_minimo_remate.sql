BEGIN;

-- 1) Campo canónico en inventario (compartido por plataformas).
ALTER TABLE public.inventario
  ADD COLUMN IF NOT EXISTS precio_minimo_remate NUMERIC;

ALTER TABLE public.inventario
  DROP CONSTRAINT IF EXISTS inventario_precio_minimo_remate_check;

ALTER TABLE public.inventario
  ADD CONSTRAINT inventario_precio_minimo_remate_check
  CHECK (precio_minimo_remate IS NULL OR precio_minimo_remate >= 0);

-- 2) Snapshot por lote para remates/venta directa publicados.
ALTER TABLE public.portal_remate_lotes
  ADD COLUMN IF NOT EXISTS precio_minimo_remate NUMERIC;

ALTER TABLE public.portal_remate_lotes
  DROP CONSTRAINT IF EXISTS portal_remate_lotes_precio_minimo_remate_check;

ALTER TABLE public.portal_remate_lotes
  ADD CONSTRAINT portal_remate_lotes_precio_minimo_remate_check
  CHECK (precio_minimo_remate IS NULL OR precio_minimo_remate >= 0);

-- Backfill inicial desde inventario; fallback a precio_base si no existe dato.
UPDATE public.portal_remate_lotes l
SET precio_minimo_remate = COALESCE(l.precio_minimo_remate, i.precio_minimo_remate, l.precio_base)
FROM public.inventario i
WHERE l.inventario_id = i.id
  AND l.precio_minimo_remate IS NULL;

UPDATE public.portal_remate_lotes
SET precio_minimo_remate = precio_base
WHERE precio_minimo_remate IS NULL;

CREATE OR REPLACE FUNCTION public.portal_lote_set_precio_minimo_remate_default()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv_min NUMERIC;
BEGIN
  IF NEW.precio_minimo_remate IS NULL AND NEW.inventario_id IS NOT NULL THEN
    SELECT i.precio_minimo_remate INTO v_inv_min
    FROM public.inventario i
    WHERE i.id = NEW.inventario_id;

    NEW.precio_minimo_remate := COALESCE(v_inv_min, NEW.precio_base, 0);
  END IF;

  IF NEW.precio_minimo_remate IS NULL THEN
    NEW.precio_minimo_remate := COALESCE(NEW.precio_base, 0);
  END IF;

  IF NEW.precio_minimo_remate < 0 THEN
    RAISE EXCEPTION 'precio_minimo_remate_invalido';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS portal_lote_set_precio_minimo_remate_default_tg ON public.portal_remate_lotes;
CREATE TRIGGER portal_lote_set_precio_minimo_remate_default_tg
BEFORE INSERT OR UPDATE OF inventario_id, precio_minimo_remate, precio_base
ON public.portal_remate_lotes
FOR EACH ROW
EXECUTE FUNCTION public.portal_lote_set_precio_minimo_remate_default();

-- 3) Enforcements reales de negocio (servidor) para pujas manuales y automáticas.
CREATE OR REPLACE FUNCTION public.portal_oferta_enforce_precio_minimo_remate()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_min NUMERIC;
BEGIN
  SELECT COALESCE(l.precio_minimo_remate, l.precio_base, 0)
    INTO v_min
  FROM public.portal_remate_lotes l
  WHERE l.id = NEW.lote_id;

  IF v_min IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.monto < v_min THEN
    RAISE EXCEPTION 'monto_menor_al_precio_minimo_remate %', v_min;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS portal_oferta_enforce_precio_minimo_remate_tg ON public.portal_ofertas;
CREATE TRIGGER portal_oferta_enforce_precio_minimo_remate_tg
BEFORE INSERT ON public.portal_ofertas
FOR EACH ROW
EXECUTE FUNCTION public.portal_oferta_enforce_precio_minimo_remate();

CREATE OR REPLACE FUNCTION public.portal_proxy_bid_enforce_precio_minimo_remate()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_min NUMERIC;
BEGIN
  SELECT COALESCE(l.precio_minimo_remate, l.precio_base, 0)
    INTO v_min
  FROM public.portal_remate_lotes l
  WHERE l.id = NEW.lote_id;

  IF v_min IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.max_monto < v_min THEN
    RAISE EXCEPTION 'monto_menor_al_precio_minimo_remate %', v_min;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS portal_proxy_bid_enforce_precio_minimo_remate_tg ON public.portal_proxy_bids;
CREATE TRIGGER portal_proxy_bid_enforce_precio_minimo_remate_tg
BEFORE INSERT OR UPDATE OF max_monto ON public.portal_proxy_bids
FOR EACH ROW
EXECUTE FUNCTION public.portal_proxy_bid_enforce_precio_minimo_remate();

COMMIT;

