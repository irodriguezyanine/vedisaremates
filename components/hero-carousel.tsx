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
      className="relative mt-10 w-full overflow-hidden rounded-2xl bg-white shadow-[0_20px_60px_rgba(0,0,0,0.12)] ring-1 ring-black/5"
      aria-roledescription="carrusel"
      aria-label="Banners destacados"
    >
      <Link href={s.href} className="relative block aspect-[1920/520] w-full max-h-[min(52vh,440px)] md:aspect-[1920/440]">
        <Image
          src={s.src}
          alt={s.alt}
          fill
          priority
          sizes="(max-width:768px) 100vw, min(1200px, 96vw)"
          className="object-cover object-center"
        />
      </Link>

      <button
        type="button"
        aria-label="Anterior"
        className="absolute left-3 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/40 bg-white/30 text-lg text-neutral-900 backdrop-blur hover:bg-white/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#33C7E3]"
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
        className="absolute right-3 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/40 bg-white/30 text-lg text-neutral-900 backdrop-blur hover:bg-white/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#33C7E3]"
        onClick={(e) => {
          e.preventDefault();
          next();
        }}
      >
        ›
      </button>

      <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-2">
        {slides.map((_, idx) => (
          <button
            key={idx}
            type="button"
            aria-label={`Ir al banner ${idx + 1}`}
            aria-current={idx === i}
            className={`h-2.5 w-2.5 rounded-full border border-black/20 transition ${
              idx === i ? "scale-110 bg-[#33C7E3]" : "bg-white/70 hover:bg-white"
            }`}
            onClick={() => setI(idx)}
          />
        ))}
      </div>
    </section>
  );
}
