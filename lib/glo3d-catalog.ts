/**
 * Extracción y normalización de URLs Glo3D alineadas con Catalogo-Vedisa
 * (iframeNova + query params públicos — sin llamar API de inventario).
 * @see https://github.com/irodriguezyanine/Catalogo-Vedisa
 */

export const GLO3D_IFRAME_NOVA_BASE = "https://glo3d.net/iframeNova";
export const GLO3D_IFRAME_PARAMS =
  "gallery=true&featurevideos=true&condition=false&interior=false&footerGallery=false&zoom=false&navigationarrows=false&spinicon=basic&font=Roboto&topbarblinking=false&fullscreen=false&load=false&autorotate=false&themetextcolor=black";

export function buildGlo3dIframeNovaUrl(id: string): string {
  /** Ídem Catalogo-Vedisa: el id va en path sin capa extra de encoding. */
  return `${GLO3D_IFRAME_NOVA_BASE}/${id}?&${GLO3D_IFRAME_PARAMS}`;
}

/** Si el valor es HTML de iframe, extrae el `src`. */
export function extractEmbedUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const raw = value.trim();
  if (!raw) return undefined;
  if (raw.startsWith("http")) return raw.replace(/\$.*$/, "");
  const match = raw.match(/src=["']([^"']+)["']/i);
  return match?.[1];
}

export function extractGlo3dId(value?: string): string | undefined {
  if (!value) return undefined;
  const s = value.trim();
  if (!s) return undefined;

  /** `?id=` solo si el contexto es Glo3D / iframe (evita URLs ajenas con query id). */
  const hostOrPathLooksGlo =
    /\bglo3d\.(?:net|com)\b/i.test(s) ||
    /\/(?:iframe|iframeNova)\b/i.test(s) ||
    /^\/(?:iframe|iframeNova)\b/i.test(s) ||
    s.startsWith("//glo3d");

  const idQuery = hostOrPathLooksGlo ? s.match(/[?&]id=([^&\s]+)/) : null;
  if (idQuery?.[1]) return idQuery[1];

  const iframePath = s.match(/glo3d\.net\/(?:iframe|iframeNova)\/([^/?\s]+)/i);
  if (iframePath?.[1]) return iframePath[1];

  const relativeIframePath = s.match(/(?:^|\/)(?:iframe|iframeNova)\/([^/?\s]+)/i);
  if (relativeIframePath?.[1]) return relativeIframePath[1];

  const genericPath = s.match(/glo3d\.net\/([^/?\s]+)(?:\?|$)/i);
  if (genericPath?.[1] && !genericPath[1].toLowerCase().includes("embed")) return genericPath[1];

  return undefined;
}

export function normalizeGlo3dUrl(value: string): string {
  const v = value.trim();
  if (!v) return v;
  if (v.startsWith("//")) return `https:${v}`;
  if (v.startsWith("/")) return `https://glo3d.net${v}`;
  return v;
}

/** Misma cadena que `normalizeRow` en Catalogo-Vedisa (+ `//` y fallback `id=` en texto crudo). */
export function resolveView3dUrlFromRaw(view3dRaw: unknown): string | undefined {
  if (typeof view3dRaw !== "string") return undefined;
  const raw = view3dRaw.trim();
  if (!raw) return undefined;
  let parsed3d = extractEmbedUrl(raw);
  if (!parsed3d) {
    if (/^https?:\/\//i.test(raw)) parsed3d = raw;
    else if (raw.startsWith("//")) parsed3d = `https:${raw}`;
  }
  const parsed3dId = extractGlo3dId(parsed3d) ?? extractGlo3dId(raw);
  if (parsed3dId) return buildGlo3dIframeNovaUrl(parsed3dId);
  if (parsed3d) return normalizeGlo3dUrl(parsed3d);
  return undefined;
}
