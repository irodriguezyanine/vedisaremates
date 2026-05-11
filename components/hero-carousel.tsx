"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import {
  FALLBACK_HERO_SLIDES,
  resolveHeroSlides,
  slidesFromEnv,
  type HeroSlide,
} from "@/lib/hero-slides-shared";
import { createClient } from "@/lib/supabase/client";
import { getPublicSupabaseEnv, isSupabaseConfigured } from "@/lib/supabase/public-env";

function heroLinkHref(slide: HeroSlide): string {
  const href = slide.href.trim() || "/";
  if (href.startsWith("/") || href.startsWith("http")) return href;
  return `/${href}`;
}

export function HeroCarousel() {
  const [slides, setSlides] = useState<HeroSlide[]>(() => slidesFromEnv() ?? [...FALLBACK_HERO_SLIDES]);

  useEffect(() => {
    if (slidesFromEnv()?.length) return;
    if (!isSupabaseConfigured()) return;

    let cancelled = false;

    async function load() {
      const sb = createClient();
      if (!sb) return;
      let { data, error } = await sb.from("portal_home_hero").select("slides").eq("id", 1).maybeSingle();
      if (error) {
        // Fallback defensivo: algunos perfiles autenticados pueden quedar bloqueados por políticas heredadas.
        // Reintentamos lectura pública (anon) para mantener el carrusel visible para todos.
        const env = getPublicSupabaseEnv();
        if (env) {
          const sbAnon = createSupabaseClient(env.url, env.key, {
            auth: {
              persistSession: false,
              autoRefreshToken: false,
              detectSessionInUrl: false,
            },
          });
          const retry = await sbAnon.from("portal_home_hero").select("slides").eq("id", 1).maybeSingle();
          if (!retry.error) {
            data = retry.data;
            error = null;
          }
        }
      }
      if (cancelled) return;
      if (error) {
        setSlides([...FALLBACK_HERO_SLIDES]);
        return;
      }
      const resolved = resolveHeroSlides({ envJson: null, dbValue: data?.slides ?? null });
      setSlides(resolved);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const [i, setI] = useState(0);

  useEffect(() => {
    if (!slides.length) return;
    setI((idx) => Math.min(idx, slides.length - 1));
  }, [slides.length]);

  const next = useCallback(() => setI((v) => (slides.length ? (v + 1) % slides.length : 0)), [slides.length]);
  const prev = useCallback(
    () =>
      setI((v) => (slides.length ? (v - 1 + slides.length) % slides.length : 0)),
    [slides.length],
  );

  useEffect(() => {
    if (slides.length <= 1) return;
    const t = setInterval(next, 6500);
    return () => clearInterval(t);
  }, [next, slides.length]);

  if (!slides.length) return null;

  const s = slides[i]!;

  let isCloudinaryHost = false;
  try {
    isCloudinaryHost = /\.cloudinary\.com$/i.test(new URL(s.src).hostname.replace(/^www\./, ""));
  } catch {
    isCloudinaryHost = false;
  }

  return (
    <section className="w-full bg-white" aria-roledescription="carrusel" aria-label="Carrusel destacado">
      <div className="relative">
        <Link
          href={heroLinkHref(s)}
          className="relative flex w-full items-center justify-center bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#009ade]"
        >
          <div className="relative h-[clamp(160px,26vh,280px)] w-full sm:h-[clamp(180px,28vh,300px)] md:h-[clamp(200px,30vh,340px)]">
            <Image
              src={s.src}
              alt={s.alt}
              fill
              priority={i === 0}
              sizes="100vw"
              className="object-contain object-center"
              unoptimized={isCloudinaryHost}
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

      <div className="flex justify-center gap-2 border-t border-neutral-100 bg-white py-1.5 sm:py-2">
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
