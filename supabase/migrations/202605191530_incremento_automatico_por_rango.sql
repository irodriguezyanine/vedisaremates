CREATE OR REPLACE FUNCTION public.portal_incremento_por_rango(p_valor NUMERIC)
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN COALESCE(p_valor, 0) <= 100000 THEN 10000
    WHEN p_valor <= 1000000 THEN 50000
    WHEN p_valor <= 4000000 THEN 100000
    WHEN p_valor <= 8000000 THEN 200000
    WHEN p_valor <= 15000000 THEN 300000
    ELSE 400000
  END;
$$;

CREATE OR REPLACE FUNCTION public.portal_lote_set_incremento_por_rango()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_referencia NUMERIC;
BEGIN
  v_referencia := GREATEST(
    COALESCE(NEW.precio_minimo_remate, 0),
    COALESCE(NEW.precio_base, 0),
    0
  );
  NEW.incremento_minimo := public.portal_incremento_por_rango(v_referencia);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_portal_lote_set_incremento_por_rango ON public.portal_remate_lotes;
CREATE TRIGGER trg_portal_lote_set_incremento_por_rango
BEFORE INSERT OR UPDATE OF precio_base, precio_minimo_remate ON public.portal_remate_lotes
FOR EACH ROW
EXECUTE FUNCTION public.portal_lote_set_incremento_por_rango();

UPDATE public.portal_remate_lotes l
SET incremento_minimo = public.portal_incremento_por_rango(
  GREATEST(COALESCE(l.precio_minimo_remate, 0), COALESCE(l.precio_base, 0), 0)
)
WHERE l.incremento_minimo IS DISTINCT FROM public.portal_incremento_por_rango(
  GREATEST(COALESCE(l.precio_minimo_remate, 0), COALESCE(l.precio_base, 0), 0)
);
