# Checklist E2E de sincronización cruzada

## Caso A: Alta de venta directa desde Catálogo
- Crear/publicar venta directa en Catálogo.
- Verificar aparición en Tasaciones `/venta-directa`.
- Verificar aparición en Portal `/subastas` (sección correspondiente).

## Caso B: Alta de remate desde Portal
- Crear remate y agregar lotes en `/admin/remates`.
- Verificar remate en Tasaciones.
- Verificar reflejo en Catálogo.

## Caso C: Cierre de evento
- Cerrar evento en uno de los sistemas.
- Verificar estado cerrado en los otros dos.

## Caso D: Eliminación controlada
- Intentar borrar remate vinculado en Portal (debe bloquear).
- Cerrar/despublicar y validar consistencia.

## Criterio de aprobación
- Sin divergencias por tipo (remate/venta_directa).
- Sin divergencias por estado (abierto/cerrado).
- Sin eventos en outbox `failed` al finalizar suite.
