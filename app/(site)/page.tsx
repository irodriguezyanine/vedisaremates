import Link from "next/link";

import { AuctionFeed } from "@/components/auction-feed";
import { HeroActionBar } from "@/components/hero-action-bar";
import { HeroCarousel } from "@/components/hero-carousel";
import { HeroShine } from "@/components/hero-shine";
import { TrustStrip } from "@/components/home-sections";
import { Reveal } from "@/components/reveal-on-scroll";
import { catalogoHref } from "@/lib/site-config";

export default function HomePage() {
  const cat = catalogoHref();

  return (
    <div className="bg-[#f1f4f8]">
      {/* Hero + acciones: ancho completo, sin contenedor estrecho */}
      <div className="flex w-full flex-col">
        <HeroShine />
        <HeroActionBar />
      </div>

      {/* Carrusel: solo imágenes, sin tarjeta ni título */}
      <div className="w-full border-y border-neutral-200/80 bg-white">
        <div className="mx-auto w-full max-w-[1920px]">
          <HeroCarousel />
        </div>
      </div>

      <div className="bg-gradient-to-b from-white via-[#f8fafc] to-[#eef2f7]">
        <Reveal className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
          <AuctionFeed />
        </Reveal>

        <div className="mx-auto max-w-7xl space-y-14 px-4 pb-16 sm:px-6 lg:px-8">
          <Reveal>
            <TrustStrip />
          </Reveal>

          <Reveal className="text-center">
            <Link
              href={cat}
              target="_blank"
              rel="noopener noreferrer"
              className="mx-auto inline-flex items-center gap-2 rounded-full border-2 border-neutral-300 bg-white px-8 py-3.5 text-sm font-bold text-neutral-800 shadow-sm transition hover:border-[#009ade] hover:text-[#009ade]"
            >
              Abrir catálogo en nueva pestaña →
            </Link>
          </Reveal>
        </div>
      </div>
    </div>
  );
}
