import type { InventarioRow } from "@/lib/portal-types";

/** Campos opcionales que a veces vienen desde Tasaciones/catálogo (además de `imagenes[]`). */
const EXTRA_IMAGE_KEYS = [
  "thumbnail_url",
  "thumb_url",
  "miniatura",
  "miniatura_url",
  "foto_miniatura",
  "url_miniatura",
  "imagen_principal",
  "foto_principal",
  "glo3d_url",
  "glo3d_link",
  "url_glo3d",
  "viewer_360_url",
  "visor_360_url",
  "url_visita_virtual",
  "link_visita_virtual",
] as const;

function isHttpsUrl(v: unknown): v is string {
  return typeof v === "string" && /^https?:\/\//i.test(v.trim());
}

function pushHttpsUnique(out: string[], u: unknown) {
  if (!isHttpsUrl(u)) return;
  const t = u.trim();
  if (!out.includes(t)) out.push(t);
}

function urlsFromJsonItem(x: unknown): string[] {
  if (isHttpsUrl(x)) return [x.trim()];
  if (!x || typeof x !== "object") return [];
  const o = x as Record<string, unknown>;
  for (const k of [
    "url",
    "src",
    "href",
    "link",
    "imagen",
    "viewer",
    "embed",
    "embed_url",
    "spin",
    "glo3d",
    "url_360",
    "link_visita",
  ]) {
    const v = o[k];
    if (isHttpsUrl(v)) return [String(v).trim()];
  }
  return [];
}

/** Parse `imagenes` JSON (array JSON en texto), string suelto, u objetos `{ url }` — tolerancia tipo catálogo. */
export function urlsFromImagenesField(raw: unknown): string[] {
  if (!raw) return [];

  if (Array.isArray(raw)) {
    return raw.flatMap((x) => {
      const direct = urlsFromJsonItem(x);
      if (direct.length) return direct;
      return urlsFromImagenesField(x);
    });
  }

  if (typeof raw === "string") {
    const s = raw.trim();
    if (s.startsWith("[") || s.startsWith("{")) {
      try {
        const parsed = JSON.parse(s) as unknown;
        return urlsFromImagenesField(parsed);
      } catch {
        return [];
      }
    }
    if (isHttpsUrl(s)) return [s.trim()];
    return [];
  }

  return urlsFromJsonItem(raw);
}

/** Lista todas las URLs de media del ítem inventario (fotos, miniaturas, enlaces CDN y Glo3D). */
export function collectInventarioMediaUrls(inv: InventarioRow & Record<string, unknown>): string[] {
  const out: string[] = [];

  for (const url of urlsFromImagenesField(inv.imagenes)) {
    pushHttpsUnique(out, url);
  }

  for (const k of EXTRA_IMAGE_KEYS) {
    pushHttpsUnique(out, inv[k]);
  }

  Object.keys(inv).forEach((k) => {
    if (/^foto_?\d*$/i.test(k) || /^imagen_?\d*$/i.test(k)) {
      pushHttpsUnique(out, inv[k]);
    }
  });

  return out;
}

const GLO3D_HINT =
  /\bglo3d\b|glo3d\.net|glo3d\.com|capture\.360|theta360|ricoh|spin\.glo3d|viewer\/embed|embed\/viewer|my360|sphere\.js/i;

export function isGlo3dOr360Url(url: string): boolean {
  return GLO3D_HINT.test(url);
}

/** URLs que suelen cargarse bien como `<img>` (miniatura o foto plana). */
export function bucketInventarioStaticImages(urls: string[]): string[] {
  return urls.filter((u) => !isGlo3dOr360Url(u));
}

/** URLs para visor embed (360 / Glo3D tal como llegan desde Tasaciones/catálogo). */
export function bucketGlo3dViewerUrls(urls: string[]): string[] {
  return urls.filter((u) => isGlo3dOr360Url(u));
}

/** Primera URL pensada para iframe / visor 360° (no sirve como `<img src>` plano). */
export function firstGlo3dViewerUrl(inv: InventarioRow & Record<string, unknown>): string | null {
  const g = bucketGlo3dViewerUrls(collectInventarioMediaUrls(inv));
  return g[0] ?? null;
}

/** Miniatura tipo catálogo: prioriza JPG/PNG/WebP explícitos, si no primera URL plana disponible. */
export function preferredThumbnailUrl(inv: InventarioRow & Record<string, unknown>): string | null {
  const all = collectInventarioMediaUrls(inv);
  const statics = bucketInventarioStaticImages(all);
  if (!statics.length) {
    // Sin foto plana: algunos setups solo tienen viewer; no hay thumb real.
    return null;
  }
  const withExt = statics.find((u) => /\.(jpe?g|png|webp|gif)(\?|#|$)/i.test(u));
  return withExt ?? statics[0] ?? null;
}
