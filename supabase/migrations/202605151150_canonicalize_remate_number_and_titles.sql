-- Canonicaliza número de remate y limpia descripciones contaminadas.
-- Caso observado: "Remate #03225" enlazado a descripción "Remate #00011 - ..."
-- Esto genera doble numeración visible entre plataformas.

BEGIN;

-- 1) Limpiar prefijos "Remate #xxxx -" en descripcion de remates.
UPDATE public.remates
SET
  descripcion = NULLIF(
    trim(
      regexp_replace(
        COALESCE(descripcion, ''),
        '^\s*remate\s*#?\s*\d+\s*[-:]\s*',
        '',
        'i'
      )
    ),
    ''
  )
WHERE COALESCE(descripcion, '') ~* '^\s*remate\s*#?\s*\d+\s*[-:]\s*';

-- 2) Reconstruir título portal desde numero_remate canónico + descripcion limpia.
UPDATE public.portal_remates pr
SET
  source_event_number = r.numero_remate,
  titulo = COALESCE(
    NULLIF(
      trim(
        concat_ws(
          ' - ',
          NULLIF(trim(COALESCE(r.numero_remate, '')), ''),
          NULLIF(trim(COALESCE(r.descripcion, '')), '')
        )
      ),
      ''
    ),
    COALESCE(NULLIF(trim(COALESCE(r.numero_remate, '')), ''), 'Remate')
  ),
  descripcion = NULLIF(trim(COALESCE(r.descripcion, '')), ''),
  updated_at = timezone('utc'::text, now())
FROM public.remates r
WHERE pr.tasaciones_remate_id = r.id;

COMMIT;

