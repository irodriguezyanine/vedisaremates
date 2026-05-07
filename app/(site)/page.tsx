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
