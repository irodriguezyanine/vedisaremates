/** Utilidades para mostrar descripciones de ficha (GLO3D / Tasaciones) con HTML o saltos de línea normalizados. */

export function normalizeDescripcionIntegrationText(raw: string): string {
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/\/n/gi, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
}

/** Contenido que probablemente trae etiquetas HTML desde el origen. */
export function textoPareceHtmlDescripcion(raw: string): boolean {
  const t = normalizeDescripcionIntegrationText(raw);
  if (!t.includes("<") || !t.includes(">")) return false;
  return /<(?:p|div|span|strong|em|br|ul|ol|li|b|i|u|h[1-6]|table|tbody|thead|tr|td|th|blockquote|small|font)\b/i.test(
    t,
  );
}

/**
 * Sanitizado mínimo para copiar HTML de terceros al DOM (sin dependencias).
 * Suprime script/iframe, handlers `on*` y esquemas peligrosos en href.
 */
export function sanitizeBasicDescripcionHtml(html: string): string {
  let s = html.replace(/<\?[\s\S]*?\?>/g, "").replace(/<!DOCTYPE[^>]*>/gi, "");
  s = s.replace(/<script\b[\s\S]*?<\/script>/gi, "");
  s = s.replace(/<script\b[^>]*\/?>/gi, "");
  s = s.replace(/<iframe\b[\s\S]*?<\/iframe>/gi, "");
  s = s.replace(/<iframe\b[^>]*\/?>/gi, "");
  s = s.replace(/<object\b[\s\S]*?<\/object>/gi, "");
  s = s.replace(/<embed\b[^>]*\/?>/gi, "");
  s = s.replace(/\son[a-z_]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  s = s.replace(/href\s*=\s*"([^"]*)"/gi, (_m, inner: string) => {
    const t = inner.trim();
    if (/^(javascript|data|vbscript):/i.test(t)) return 'href="#"';
    return `href="${inner}"`;
  });
  s = s.replace(/href\s*=\s*'([^']*)'/gi, (_m, inner: string) => {
    const t = inner.trim();
    if (/^(javascript|data|vbscript):/i.test(t)) return "href=\"#\"";
    return `href='${inner}'`;
  });
  return s;
}
