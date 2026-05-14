# Sync Playbook (Portal <-> Tasaciones <-> Catalogo)

## Objetivo
Mantener remates, ventas directas y lotes sincronizados en los 3 sistemas.

## Runbook rápido
1. Revisar estado actual:
   - `SELECT * FROM public.portal_integracion_sync_dashboard();`
2. Si hay pendientes/fallidos:
   - `SELECT public.portal_integracion_replay_failed(500);`
   - `SELECT public.portal_integracion_bootstrap_desde_tasaciones(5000);`
   - `SELECT public.portal_integracion_bootstrap_desde_portal(5000);`
   - `SELECT public.portal_integracion_procesar_outbox(5000);`
3. Confirmar en UI admin `/admin/remates`:
   - pendientes = 0
   - fallidos = 0

## Fallas comunes
- `EVENTO_DESCONOCIDO`: migraciones desalineadas entre entornos.
- `No autorizado`: RPCs críticas restringidas a `service_role`.
- Duplicados por patente: revisar normalización y vínculos `tasaciones_remate_item_id`.

## Política de borrado
- Preferir **cerrar/despublicar** remates.
- No borrar remates vinculados (`tasaciones_remate_id`).

## Definición de Done de sincronización
- Alta/edición/cierre en cualquier portal visible en los otros 2.
- Históricos reconciliados con bootstrap sin errores.
- Dashboard de sync sin pendientes/fallidos al cierre del día.
