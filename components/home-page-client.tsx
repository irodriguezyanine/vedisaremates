"use client";

import Link from "next/link";
import { useState } from "react";

import { AuctionFeed } from "@/components/auction-feed";
import { HeroActionBar } from "@/components/hero-action-bar";
import { HeroCarousel } from "@/components/hero-carousel";
import { HeroInventorySearch } from "@/components/hero-inventory-search";
import { HeroShine } from "@/components/hero-shine";
import { Reveal } from "@/components/reveal-on-scroll";

export function HomePageClient({ catalogoUrl }: { catalogoUrl: string }) {
  const [searchMode, setSearchMode] = useState(false);

  return (
    <div className="bg-[#f1f4f8]">
      <HeroInventorySearch onSearchActiveChange={setSearchMode} />

      {searchMode ? null : (
        <>
          <div className="flex w-full flex-col">
            <HeroShine />
            <HeroActionBar />
          </div>

          <div className="w-full border-y border-neutral-200/80 bg-white">
            <div className="mx-auto w-full max-w-[1920px]">
              <HeroCarousel />
            </div>
          </div>

          <div className="bg-gradient-to-b from-white via-[#f8fafc] to-[#eef2f7]">
            <Reveal className="mx-auto max-w-7xl px-4 pt-1 pb-0 sm:px-6 sm:pt-2 lg:px-8">
              <AuctionFeed />
            </Reveal>

            <div className="mx-auto max-w-7xl px-4 pb-8 pt-4 sm:px-6 sm:pb-10 sm:pt-5 lg:px-8">
              <Reveal className="text-center">
                <Link
                  href={catalogoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mx-auto inline-flex items-center gap-2 rounded-full border-2 border-neutral-300 bg-white px-8 py-3.5 text-sm font-bold text-neutral-800 shadow-sm transition hover:border-[#009ade] hover:text-[#009ade]"
                >
                  Abrir catálogo en nueva pestaña →
                </Link>
              </Reveal>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

