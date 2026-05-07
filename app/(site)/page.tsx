import Link from "next/link";

import { AuctionFeed } from "@/components/auction-feed";
import { HeroActionBar } from "@/components/hero-action-bar";
import { HeroCarousel } from "@/components/hero-carousel";
import { HeroShine } from "@/components/hero-shine";
import { CtaRegisterBand, RegisterPitch, TrustStrip } from "@/components/home-sections";
import { Reveal } from "@/components/reveal-on-scroll";
import { catalogoHref } from "@/lib/site-config";

export default function HomePage() {
  const cat = catalogoHref();

  return (
    <div className="bg-gradient-to-b from-[#e8f4fc] via-[#fdfefe] to-white">
      <div className="mx-auto max-w-6xl px-4 pb-6 pt-14 sm:px-6 lg:px-8">
        <HeroShine />
      </div>
      <HeroActionBar />
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <HeroCarousel />
      </div>

      <Reveal className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <AuctionFeed />
      </Reveal>

      <div className="mx-auto max-w-7xl space-y-14 px-4 py-6 sm:px-6 lg:px-8">
        <Reveal>
          <TrustStrip />
        </Reveal>
        <Reveal className="grid gap-12 lg:grid-cols-2 lg:items-start">
          <CtaRegisterBand />
          <RegisterPitch />
        </Reveal>

        <Reveal className="rounded-2xl border border-neutral-200 bg-white p-8 shadow-sm">
          <h2 className="text-center text-2xl font-extrabold uppercase tracking-tight text-[#009ade] md:text-3xl">
            Vedisa <span className="text-[#FFC107]">Remates</span>
          </h2>
          <p className="mx-auto mt-4 max-w-3xl text-center text-neutral-600">
            Expertos en gestión de activos y maximizar recupero. Más de tres décadas conectando compañías de seguros,
            leasing y compradores en todo Chile con inventario digital trazable.
          </p>
          <div className="mt-8 text-center">
            <Link
              href="/acerca"
              className="inline-flex rounded-full bg-[#FFC107] px-8 py-3 text-sm font-bold text-neutral-900 shadow-md hover:bg-[#009ade] hover:text-white"
            >
              Conocer la empresa
            </Link>
          </div>
        </Reveal>

        <Reveal className="text-center">
          <Link
            href={cat}
            target="_blank"
            rel="noopener noreferrer"
            className="mx-auto inline-flex items-center gap-2 rounded-full border-2 border-neutral-300 px-6 py-3 text-sm font-semibold text-neutral-800 hover:border-[#33C7E3]"
          >
            Abrir catálogo en nueva pestaña →
          </Link>
        </Reveal>
      </div>
    </div>
  );
}
