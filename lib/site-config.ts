/** URLs y textos centralizados (sin secretos). */
import {
  FALLBACK_HERO_SLIDES,
  resolveHeroSlides,
  type HeroSlide,
} from "@/lib/hero-slides-shared";

export type { HeroSlide };

export const SITE = {
  name: "VEDISA Remates",
  tagline: "Maximizar recupero vehicular",
  whatsappE164: "+56989323397",
  whatsappHref: "https://wa.me/56989323397",
  contactPhoneDisplay: "+56 9 8932 3397",
  telHref: "tel:+56989323397",
  mapsExhibicionHref:
    "https://www.google.com/maps/dir/?api=1&destination=Arturo+Prat+6457,+Noviciado,+Pudahuel",
  legacyRainworksHelp: "https://www.vehiculoschocados.cl/Help",
  pagosEmail: "pagos@vedisaremates.cl",
  guaranteeAmountDisplay: "$300.000",
} as const;

export function catalogoHref() {
  return process.env.NEXT_PUBLIC_CATALOGO_URL ?? "https://catalogo.vedisaremates.cl/";
}

export function heroVideoId() {
  return process.env.NEXT_PUBLIC_HERO_YOUTUBE_ID ?? "2BLLkGCIQWI";
}

/** Sin consultar base: útil donde solo haga falta env + fallback estático. */
export function defaultHeroSlides(): HeroSlide[] {
  return resolveHeroSlides({ envJson: process.env.NEXT_PUBLIC_HERO_SLIDES_JSON ?? null });
}

/** @internal export para si se necesitan los valores estáticos fuera del carrusel. */
export const staticHeroSlidesFallback = FALLBACK_HERO_SLIDES satisfies readonly HeroSlide[];
