/** Tipos y fallbacks del carrusel del home — importable desde cliente y servidor sin env cliente-only. */

export type HeroSlide = { src: string; href: string; alt: string };

/** Imágenes por defecto cuando no hay env ni registros en base. */
export const FALLBACK_HERO_SLIDES: HeroSlide[] = [
  {
    src: "https://i.postimg.cc/nhjnrxmT/portada-1-V3.jpg",
    href: "/",
    alt: "VEDISA Remates — campaña 1",
  },
  {
    src: "https://i.postimg.cc/nhjnrxmk/PORTADA-2.jpg",
    href: "/",
    alt: "VEDISA Remates — campaña 2",
  },
  {
    src: "https://i.postimg.cc/y8g7xKRc/portada-3-1.jpg.jpg",
    href: "/",
    alt: "VEDISA Remates — campaña 3",
  },
  {
    src: "https://i.postimg.cc/Gm8btRDK/portada-3-2.jpg",
    href: "/",
    alt: "VEDISA Remates — campaña 4",
  },
];

function parseSlidesFromJsonString(raw: string | undefined): HeroSlide[] | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return coerceHeroSlides(parsed);
  } catch {
    return null;
  }
}

/** Valida/normaliza datos provenientes del JSON público (.env). */
export function coerceHeroSlides(value: unknown): HeroSlide[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const out: HeroSlide[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const src = typeof o.src === "string" ? o.src.trim() : "";
    if (!/^https:\/\//i.test(src)) continue;
    const hrefRaw = typeof o.href === "string" ? o.href.trim() : "";
    const href = hrefRaw.startsWith("/") || /^https:\/\//i.test(hrefRaw) ? hrefRaw || "/" : "/";
    let alt = typeof o.alt === "string" ? o.alt.trim() : "";
    if (!alt) alt = "Banner VEDISA Remates";
    out.push({ src, href: href || "/", alt });
  }
  return out.length > 0 ? out.slice(0, 12) : null;
}

/**
 * Env `NEXT_PUBLIC_HERO_SLIDES_JSON` (despliegue) > BD > valores estáticos.
 */
export function resolveHeroSlides(sources: { envJson?: string | null; dbValue?: unknown }): HeroSlide[] {
  const fromEnv = parseSlidesFromJsonString(sources.envJson ?? undefined);
  if (fromEnv?.length) return fromEnv;

  const fromDb = coerceHeroSlides(sources.dbValue);
  if (fromDb?.length) return fromDb;

  return [...FALLBACK_HERO_SLIDES];
}

/** Overrides de despliegue (variable pública) ya parseados. */
export function slidesFromEnv(): HeroSlide[] | null {
  return parseSlidesFromJsonString(
    typeof process.env.NEXT_PUBLIC_HERO_SLIDES_JSON === "string"
      ? process.env.NEXT_PUBLIC_HERO_SLIDES_JSON
      : undefined,
  );
}

export const HERO_CAROUSEL_SLOT_COUNT = 4;

export function slidesForAdminForm(existing: HeroSlide[]): HeroSlide[] {
  const base = existing.slice(0, HERO_CAROUSEL_SLOT_COUNT);
  while (base.length < HERO_CAROUSEL_SLOT_COUNT) {
    base.push({ src: "", href: "/", alt: `Banner ${base.length + 1}` });
  }
  return base;
}

export function sanitizeSlidesForSave(slides: HeroSlide[]): HeroSlide[] {
  const out: HeroSlide[] = [];
  for (let i = 0; i < HERO_CAROUSEL_SLOT_COUNT; i++) {
    const s = slides[i];
    const src = typeof s?.src === "string" ? s.src.trim() : "";
    const hrefRaw = typeof s?.href === "string" ? s.href.trim() : "/";
    const href = hrefRaw || "/";
    const altRaw = typeof s?.alt === "string" ? s.alt.trim() : "";
    const alt = altRaw || `Banner ${i + 1}`;
    if (/^https:\/\//i.test(src)) out.push({ src, href, alt });
  }
  return out;
}
