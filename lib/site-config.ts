/** URLs y textos centralizados (sin secretos). */
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

export type HeroSlide = { src: string; href: string; alt: string };

export function defaultHeroSlides(): HeroSlide[] {
  const raw = process.env.NEXT_PUBLIC_HERO_SLIDES_JSON;
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed) && parsed.length > 0) return parsed as HeroSlide[];
    } catch {
      /* noop */
    }
  }
  return [
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
}
