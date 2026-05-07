"use client";

import Link from "next/link";

import { catalogoHref, SITE } from "@/lib/site-config";

import { VideoModal } from "./video-modal";

export function HeroActionBar() {
  const cat = catalogoHref();

  const btn =
    "flex flex-1 items-center justify-center gap-2 rounded-lg border border-neutral-200 bg-[#f4f6f8] px-3 py-3 text-center text-[13px] font-semibold text-[#2c3e50] shadow-sm transition hover:bg-white hover:shadow-md md:text-sm min-h-[48px]";

  return (
    <div className="mx-auto mt-8 max-w-6xl px-4 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
        <Link href={SITE.whatsappHref} target="_blank" rel="noopener noreferrer" className={btn}>
          <span aria-hidden>📞</span>
          <span>
            <strong className="font-bold">Contact Center:</strong> {SITE.contactPhoneDisplay}
          </span>
        </Link>
        <Link href={cat} target="_blank" rel="noopener noreferrer" className={btn}>
          <span aria-hidden>📄</span>
          <strong>Ver catálogo</strong>
        </Link>
        <VideoModal />
        <Link href={SITE.mapsExhibicionHref} target="_blank" rel="noopener noreferrer" className={btn}>
          <span aria-hidden>📍</span>
          <strong>Cómo llegar</strong>
        </Link>
      </div>
    </div>
  );
}
