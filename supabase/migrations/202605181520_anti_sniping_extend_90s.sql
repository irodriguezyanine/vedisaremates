-- Ajusta extensión automática anti-sniping a 90 segundos.
-- Aplica a nuevos valores por defecto y a la configuración activa.

ALTER TABLE IF EXISTS public.portal_remates_config
  ALTER COLUMN anti_sniping_extend_seconds SET DEFAULT 90;

UPDATE public.portal_remates_config
SET anti_sniping_extend_seconds = 90
WHERE anti_sniping_extend_seconds IS NULL
   OR anti_sniping_extend_seconds = 120;
