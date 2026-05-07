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
    <section className="w-full bg-white" aria-roledescription="carrusel" aria-label="Carrusel destacado">
      <div className="relative">
        <Link
          href={s.href}
          className="relative flex w-full items-center justify-center bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#009ade]"
        >
          <div className="relative h-[clamp(160px,26vh,280px)] w-full sm:h-[clamp(180px,28vh,300px)] md:h-[clamp(200px,30vh,340px)]">
            <Image
              src={s.src}
              alt={s.alt}
              fill
              priority
              sizes="100vw"
              className="object-contain object-center"
            />
          </div>
        </Link>

        <button
          type="button"
          aria-label="Anterior"
          className="absolute left-2 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/35 text-lg text-white backdrop-blur-sm transition hover:bg-black/50 sm:left-3 md:h-10 md:w-10"
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
          className="absolute right-2 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/35 text-lg text-white backdrop-blur-sm transition hover:bg-black/50 sm:right-3 md:h-10 md:w-10"
          onClick={(e) => {
            e.preventDefault();
            next();
          }}
        >
          ›
        </button>
      </div>

      <div className="flex justify-center gap-2 border-t border-neutral-100 bg-white py-2 sm:py-2.5">
        {slides.map((_, idx) => (
          <button
            key={idx}
            type="button"
            aria-label={`Ir al banner ${idx + 1}`}
            aria-current={idx === i}
            className={`h-2 w-2 rounded-full transition ${
              idx === i ? "bg-[#009ade] ring-2 ring-[#009ade]/30" : "bg-neutral-300 hover:bg-neutral-400"
            }`}
            onClick={() => setI(idx)}
          />
        ))}
      </div>
    </section>
  );
}
