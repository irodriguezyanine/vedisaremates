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
  for (const k of ["url", "src", "href", "link", "imagen"]) {
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

const GLO3D_HINT = /\bglo3d\b|capture\.360|theta360|ricoh/i;

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
