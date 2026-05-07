"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { defaultHeroSlides, type HeroSlide } from "@/lib/site-config";

function useSlides(): HeroSlide[] {
  const [slides] = useState(() => defaultHeroSlides());
  return slides;
}

export function HeroCarousel() {
  const slides = useSlides();
  const [i, setI] = useState(0);

  const next = useCallback(() => setI((v) => (v + 1) % slides.length), [slides.length]);
  const prev = useCallback(() => setI((v) => (v - 1 + slides.length) % slides.length), [slides.length]);

  useEffect(() => {
    const t = setInterval(next, 6500);
    return () => clearInterval(t);
  }, [next]);

  if (slides.length === 0) return null;

  const s = slides[i]!;

  return (
    <section
      className="relative w-full overflow-hidden rounded-2xl bg-slate-950 shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_25px_80px_-12px_rgba(0,0,0,0.65)] ring-1 ring-white/10"
      aria-roledescription="carrusel"
      aria-label="Banners destacados"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br from-[#33C7E3]/25 via-transparent to-[#FFC600]/15 opacity-70"
      />
      <Link
        href={s.href}
        className="relative block aspect-[1920/520] w-full max-h-[min(56vh,480px)] md:aspect-[1920/460]"
      >
        <Image
          src={s.src}
          alt={s.alt}
          fill
          priority
          sizes="(max-width:768px) 100vw, min(1800px, 100vw)"
          className="object-cover object-center"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/20" />
      </Link>

      <button
        type="button"
        aria-label="Anterior"
        className="absolute left-4 top-1/2 z-10 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-black/40 text-xl text-white shadow-lg backdrop-blur-md transition hover:bg-black/55 hover:ring-2 hover:ring-[#33C7E3]/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#33C7E3]"
        onClick={(e) => {
          e.preventDefault();
          prev();
        }}
      >
        ‹
      </button>
      <button
        type="button"
        aria-label="Siguiente"
        className="absolute right-4 top-1/2 z-10 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-black/40 text-xl text-white shadow-lg backdrop-blur-md transition hover:bg-black/55 hover:ring-2 hover:ring-[#33C7E3]/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#33C7E3]"
        onClick={(e) => {
          e.preventDefault();
          next();
        }}
      >
        ›
      </button>

      <div className="absolute bottom-5 left-0 right-0 flex justify-center gap-2.5">
        {slides.map((_, idx) => (
          <button
            key={idx}
            type="button"
            aria-label={`Ir al banner ${idx + 1}`}
            aria-current={idx === i}
            className={`h-2.5 w-2.5 rounded-full border border-white/30 transition ${
              idx === i
                ? "scale-125 bg-[#FFC600] shadow-[0_0_12px_rgba(255,193,7,0.7)]"
                : "bg-white/40 hover:bg-white/70"
            }`}
            onClick={() => setI(idx)}
          />
        ))}
      </div>
    </section>
  );
}
