ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS remate_notificaciones JSONB NOT NULL DEFAULT jsonb_build_object(
  'oferta_confirmada', true,
  'oferta_superada', true,
  'oferta_aceptada', true,
  'recordatorio_cierre', true,
  'resumen_resultado', true
);

COMMENT ON COLUMN public.profiles.remate_notificaciones IS
'Preferencias de notificaciones por correo del cliente-remate.';
