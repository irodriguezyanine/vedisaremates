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

      {/* Puente visual hacia el carrusel (evita corte brusco claro/oscuro) */}
      <div className="relative w-full overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#f8fafc] via-[#cbd5e1] to-[#0f172a]"
        />
        <div className="relative mx-auto w-full max-w-[1920px] px-4 pb-10 pt-10 sm:px-6 sm:pb-14 sm:pt-12 lg:px-10">
          <p className="mb-4 text-center text-[11px] font-bold uppercase tracking-[0.28em] text-slate-600">
            Campañas y remates
          </p>
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
