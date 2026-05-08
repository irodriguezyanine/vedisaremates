import type { InventarioRow } from "@/lib/portal-types";
import {
  buildGlo3dIframeNovaUrl,
  extractGlo3dId,
  normalizeGlo3dUrl,
  resolveView3dUrlFromRaw,
} from "@/lib/glo3d-catalog";

/**
 * Mismos campos que `view3dRaw` en Catalogo-Vedisa (`normalizeRow`).
 * @see https://github.com/irodriguezyanine/Catalogo-Vedisa
 */
const VIEW3D_FIELD_KEYS = [
  "url_3d",
  "link_3d",
  "visor_3d_url",
  "glo3d_url",
  "iframe_3d",
  "view3d",
  "iframe",
  "iframe_with_params",
  "src",
  "src_with_params",
  /** Respuesta típica API inventario Glo3D (Catalogo-Vedisa). */
  "foto3d",
  "foto_3d",
  "embed_360",
  "vista_360",
  "captura_360",
  "viewer_url",
  "visor_url",
] as const;

const VIEW3D_KEY_SET = new Set<string>(VIEW3D_FIELD_KEYS);

const MAX_JSON_WALK_DEPTH = 14;
const MAX_STRING_COLLECT_LEN = 12_000;

/** Recoge strings dentro de objetos/array (p. ej. `imagenes` JSON denso desde Tasaciones). */
function forEachNestedString(node: unknown, visitor: (s: string) => void, depth = 0): void {
  if (depth > MAX_JSON_WALK_DEPTH) return;
  if (typeof node === "string") {
    const t = node.trim();
    if (t && t.length <= MAX_STRING_COLLECT_LEN) visitor(t);
    return;
  }
  if (node === null || node === undefined) return;
  if (typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const x of node) forEachNestedString(x, visitor, depth + 1);
    return;
  }
  for (const v of Object.values(node)) {
    forEachNestedString(v, visitor, depth + 1);
  }
}

/** Campos de imagen / galería frecuentes en Tasaciones y catálogo. */
const EXTRA_IMAGE_KEYS = [
  "thumbnail_url",
  "thumbnail",
  "thumb_url",
  "miniatura",
  "miniatura_url",
  "foto_miniatura",
  "url_miniatura",
  "imagen_principal",
  "foto_principal",
  "foto_portada",
  "fotos_urls",
  "fotos",
  "galeria",
  "galeria_fotos",
  "images",
  "photos",
  "photo_urls",
  "viewer_360_url",
  "visor_360_url",
  "url_visita_virtual",
  "link_visita_virtual",
  "glo3d_url",
  "glo3d_link",
  "url_glo3d",
] as const;

function toCollectableUrl(v: unknown): string | null {
  if (typeof v === "number" && Number.isFinite(v)) return toCollectableUrl(String(v));
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  if (/^https?:\/\//i.test(t)) return t;
  if (t.startsWith("//")) return `https:${t}`;
  return null;
}

function pushUnique(out: string[], u: unknown) {
  const n = toCollectableUrl(u);
  if (n && !out.includes(n)) out.push(n);
}

function urlsFromJsonItem(x: unknown): string[] {
  if (typeof x === "string") {
    const s = x.trim();
    if (!s) return [];
    if (s.startsWith("//")) return [`https:${s}`];
  }
  const direct = toCollectableUrl(x);
  if (direct) return [direct];
  if (!x || typeof x !== "object") return [];
  const o = x as Record<string, unknown>;
  for (const k of [
    "url",
    "src",
    "href",
    "link",
    "imagen",
    "image",
    "image_url",
    "photo",
    "preview",
    "thumbnail",
    "picture",
    "viewer",
    "embed",
    "embed_url",
    "spin",
    "glo3d",
    "url_360",
    "link_visita",
    "vista360",
    "vista_360",
  ]) {
    const v = o[k];
    const n = toCollectableUrl(v);
    if (n) return [n];
  }
  for (const v of Object.values(o)) {
    if (typeof v === "string") {
      const t = v.trim();
      if (t.includes("<iframe") || /\bglo3d\.(?:net|com)\b/i.test(t)) return [t];
    }
    const nested = urlsFromImagenesField(v);
    if (nested.length) return nested;
  }
  return [];
}

/** Parse `imagenes` y campos análogos (JSON, URLs sueltas, listas separadas por coma, HTML iframe). */
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
    if (!s) return [];
    if (s.includes("<iframe") || /\bglo3d\.net/i.test(s)) return [s];
    if (s.startsWith("[") || s.startsWith("{")) {
      try {
        const parsed = JSON.parse(s) as unknown;
        return urlsFromImagenesField(parsed);
      } catch {
        return [];
      }
    }
    const direct = toCollectableUrl(s);
    if (direct) return [direct];
    /** Comma-separated URLs (patrón catálogo / exports CSV). */
    const parts = s
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => toCollectableUrl(part))
      .filter((x): x is string => Boolean(x));
    return parts.length ? parts : [];
  }

  return urlsFromJsonItem(raw);
}

/** Lista todas las URLs https/`//` coleccionables (fotos, miniaturas, visores como URL). */
export function collectInventarioMediaUrls(inv: InventarioRow & Record<string, unknown>): string[] {
  const out: string[] = [];

  const imageFields = ["imagenes", "fotos", "galeria", "galeria_fotos", "images", "photos", "photo_urls", "fotos_urls"] as const;
  for (const k of imageFields) {
    const v = inv[k as keyof typeof inv];
    if (v === undefined) continue;
    for (const url of urlsFromImagenesField(v)) {
      const n = toCollectableUrl(url);
      if (n && !out.includes(n)) out.push(n);
    }
  }

  for (const k of EXTRA_IMAGE_KEYS) {
    pushUnique(out, inv[k]);
  }

  for (const k of VIEW3D_FIELD_KEYS) {
    pushUnique(out, inv[k]);
  }

  for (const key of Object.keys(inv)) {
    if (/^foto_?\d*$/i.test(key) || /^imagen_?\d*$/i.test(key)) {
      pushUnique(out, inv[key]);
    }
  }

  /** URLs sueltas muy anidadas (`metadata`, blobs JSON en columnas tipo Tasaciones). */
  forEachNestedString(inv, (s) => {
    const n = toCollectableUrl(s);
    if (n && !out.includes(n)) out.push(n);
  });

  return out;
}

const GLO3D_HINT =
  /\bglo3d\b|glo3d\.net|glo3d\.com|capture\.360|theta360|ricoh|spin\.glo3d|viewer\/embed|embed\/viewer|my360|sphere\.js|iframenova/i;

/** Heurística cercana a `isLikelyImageUrl` del catálogo para no usar iframes Glo3D como `<img>`. */
export function isLikelyRasterImageUrl(url?: string): boolean {
  if (!url || !url.startsWith("http")) return false;
  const normalized = url.toLowerCase();
  if (normalized.includes("<iframe")) return false;
  if (normalized.includes("glo3d.net/ifram")) return false;
  /** Capturas / rutas Glo3D que no son el visor iframe. */
  if (/glo3d\.(net|com)\//i.test(normalized) && !/\/(?:iframe|iframenova)(?:\/|\?|$)/i.test(normalized)) return true;
  if (/\.(jpg|jpeg|png|webp|gif|bmp|avif)(\?|#|$)/i.test(normalized)) return true;
  return /cdn\.|cloudfront|amazonaws|supabase|img|image|media|cloudinary/.test(normalized);
}

export function isGlo3dOr360Url(url: string): boolean {
  return GLO3D_HINT.test(url);
}

export function getInventarioGlo3dIframeUrls(inv: InventarioRow & Record<string, unknown>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (u: string | undefined) => {
    if (!u?.trim()) return;
    const t = u.trim();
    if (seen.has(t)) return;
    seen.add(t);
    out.push(t);
  };

  for (const k of VIEW3D_FIELD_KEYS) {
    const v = inv[k];
    add(resolveView3dUrlFromRaw(v));
  }

  for (const blob of urlsFromImagenesField(inv.imagenes)) {
    if (typeof blob === "string" && (/\bglo3d\b/i.test(blob) || blob.includes("<iframe"))) {
      add(resolveView3dUrlFromRaw(blob));
    }
  }

  for (const u of collectInventarioMediaUrls(inv)) {
    if (!isGlo3dOr360Url(u)) continue;
    const id = extractGlo3dId(u);
    add(id ? buildGlo3dIframeNovaUrl(id) : normalizeGlo3dUrl(u));
  }

  for (const [key, val] of Object.entries(inv)) {
    if (VIEW3D_KEY_SET.has(key)) continue;
    if (typeof val !== "string") continue;
    if (!/\bglo3d\b|<iframe/i.test(val)) continue;
    add(resolveView3dUrlFromRaw(val));
  }

  /** HTML embebido o URLs dentro de objetos (`imagenes` complejos, blobs sync). */
  forEachNestedString(inv, (s) => {
    if (!/\bglo3d\b|<iframe|\biframeNova\b|\bsrc_with_params\b|\biframe_with_params\b/i.test(s)) return;
    add(resolveView3dUrlFromRaw(s));
  });

  return out;
}

export function getInventarioStaticImageUrls(inv: InventarioRow & Record<string, unknown>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (url: string) => {
    const t = url.trim();
    if (!t.startsWith("http") || !isLikelyRasterImageUrl(t) || seen.has(t)) return;
    seen.add(t);
    out.push(t);
  };

  for (const u of collectInventarioMediaUrls(inv)) {
    add(u);
  }

  for (const blob of urlsFromImagenesField(inv.imagenes)) {
    const n = toCollectableUrl(blob);
    if (n) add(n);
  }

  forEachNestedString(inv, (s) => {
    const n = toCollectableUrl(s);
    if (n) add(n);
  });

  return out;
}

export function bucketInventarioStaticImages(urls: string[]): string[] {
  return urls.filter((u) => isLikelyRasterImageUrl(u));
}

/** Canonicaliza rutas conocidas Glo3D a `iframeNova` cuando hay ID en path/query. */
export function bucketGlo3dViewerUrls(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of urls) {
    if (!isGlo3dOr360Url(u)) continue;
    const id = extractGlo3dId(u);
    const canon = id ? buildGlo3dIframeNovaUrl(id) : normalizeGlo3dUrl(u.startsWith("//") ? `https:${u}` : u);
    if (seen.has(canon)) continue;
    seen.add(canon);
    out.push(canon);
  }
  return out;
}

export function firstGlo3dViewerUrl(inv: InventarioRow & Record<string, unknown>): string | null {
  return getInventarioGlo3dIframeUrls(inv)[0] ?? null;
}

export function preferredThumbnailUrl(inv: InventarioRow & Record<string, unknown>): string | null {
  const statics = getInventarioStaticImageUrls(inv);
  if (!statics.length) return null;
  const withExt = statics.find((u) => /\.(jpe?g|png|webp|gif)(\?|#|$)/i.test(u));
  return withExt ?? statics[0] ?? null;
}
