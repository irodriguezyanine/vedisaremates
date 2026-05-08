"use client";

import Image from "next/image";
import { useMemo, useState } from "react";

import type { InventarioRow } from "@/lib/portal-types";
import { getInventarioGlo3dIframeUrls, getInventarioStaticImageUrls } from "@/lib/inventario-media";

type Props = {
  inventario: (InventarioRow & Record<string, unknown>) | null;
  /** `showcase`: ficha tipo portal de autos — 360° destacado + fotos en bloque único tipo listado profesional */
  presentation?: "standard" | "showcase";
  /** Miniaturas verticales al lado de la foto principal (tipo avisos estilo Chileautos). */
  verticalPhotoThumbs?: boolean;
};

export function InventarioMediaGallery({
  inventario,
  presentation = "standard",
  verticalPhotoThumbs = true,
}: Props) {
  const [photoIndex, setPhotoIndex] = useState(0);

  const { statics, glo3d } = useMemo(() => {
    if (!inventario) return { statics: [] as string[], glo3d: [] as string[] };
    return {
      statics: getInventarioStaticImageUrls(inventario),
      glo3d: getInventarioGlo3dIframeUrls(inventario),
    };
  }, [inventario]);

  if (!inventario || (statics.length === 0 && glo3d.length === 0)) return null;

  const mainStill = statics[photoIndex] ?? statics[0];

  const label = [
    inventario.marca,
    inventario.modelo,
    inventario.patente ? `(${inventario.patente})` : null,
  ]
    .filter(Boolean)
    .join(" ");

  const hostname = mainStill
    ? (() => {
        try {
          return new URL(mainStill).hostname.toLowerCase();
        } catch {
          return "";
        }
      })()
    : "";

  const useOptimizer =
    !!mainStill &&
    (/\bcloudinary\b/i.test(mainStill) ||
      hostname.endsWith("supabase.co") ||
      hostname.includes("cloudinary"));

  const glo3Primary = glo3d[0];
  /** Ficha profesional / remate público */
  if (presentation === "showcase") {
    return (
      <div className="space-y-6">
        {glo3Primary ? (
          <section aria-label="Visor interactivo 360°">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold tracking-tight text-neutral-900">
                Vista 360° · recorrido interactivo
              </h3>
              <span className="hidden text-xs text-neutral-400 sm:inline">Girá el vehículo con el dedo o el mouse</span>
            </div>
            <div className="mt-3 overflow-hidden rounded-2xl border border-neutral-200 bg-black shadow-inner">
              <iframe
                title={`360° — ${label || "vehículo"}`}
                src={glo3Primary}
                className="h-[min(52vh,520px)] w-full min-h-[260px]"
                allow="fullscreen; gyroscope"
                loading="lazy"
                referrerPolicy="strict-origin-when-cross-origin"
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
              />
            </div>
          </section>
        ) : null}

        {/* Fotos planas sólo si no hay visor GLO3D (evita duplicar lo mismo que el iframe con galería integrada). */}
        {statics.length > 0 && glo3d.length === 0 ? (
          <section aria-label="Galería de fotografías">
            <h3 className="text-sm font-bold tracking-tight text-neutral-900">Galería de fotografías</h3>
            <div className={`mt-3 ${verticalPhotoThumbs && statics.length > 1 ? "flex flex-col gap-3 lg:flex-row lg:items-stretch" : "space-y-3"}`}>
              <div className="relative aspect-video min-h-[200px] w-full flex-1 overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-950 shadow-sm lg:aspect-auto lg:min-h-[min(52vh,440px)]">
                {mainStill ? (
                  useOptimizer ? (
                    <Image
                      src={mainStill}
                      alt={label ? `${label}` : "Imagen del vehículo"}
                      fill
                      className="object-cover object-center"
                      sizes="(max-width: 768px) 100vw, 960px"
                      priority={photoIndex === 0}
                    />
                  ) : (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={mainStill}
                      alt={label ? `${label}` : "Imagen del vehículo"}
                      className="h-full w-full object-cover object-center"
                      loading={photoIndex === 0 ? "eager" : "lazy"}
                      decoding="async"
                    />
                  )
                ) : null}
              </div>

              {statics.length > 1 && verticalPhotoThumbs ? (
                <div
                  className="flex flex-row gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:thin] lg:max-h-[min(52vh,440px)] lg:w-[7.25rem] lg:shrink-0 lg:flex-col lg:overflow-x-hidden lg:overflow-y-auto lg:pb-0 [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar]:w-1.5 lg:[&::-webkit-scrollbar]:h-auto [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-neutral-300"
                  style={{ scrollbarWidth: "thin" }}
                >
                  {statics.map((src, idx) => (
                    <button
                      key={src}
                      type="button"
                      onClick={() => setPhotoIndex(idx)}
                      aria-label={`Foto ${idx + 1} de ${statics.length}`}
                      className={`relative h-16 w-[5.25rem] shrink-0 overflow-hidden rounded-lg border-2 lg:h-[4.5rem] lg:w-full ${
                        idx === photoIndex ? "border-[#009ade] ring-2 ring-[#009ade]/25" : "border-transparent ring-1 ring-neutral-200"
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" />
                    </button>
                  ))}
                </div>
              ) : statics.length > 1 ? (
                <div
                  className="flex gap-2 overflow-x-auto pb-1 pt-1 [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-neutral-300"
                  style={{ scrollbarWidth: "thin" }}
                >
                  {statics.map((src, idx) => (
                    <button
                      key={src}
                      type="button"
                      onClick={() => setPhotoIndex(idx)}
                      aria-label={`Foto ${idx + 1} de ${statics.length}`}
                      className={`relative h-16 w-[5.25rem] shrink-0 overflow-hidden rounded-lg border-2 md:h-[4.75rem] md:w-28 ${
                        idx === photoIndex ? "border-[#009ade] ring-2 ring-[#009ade]/25" : "border-transparent ring-1 ring-neutral-200"
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" />
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </section>
        ) : null}

      </div>
    );
  }

  /* ─── standard (original) ─── */

  const mainContainClass = "object-contain";

  return (
    <div className="mt-5 space-y-5 border-t border-neutral-100 pt-5">
      {glo3d.length ? (
        <section aria-label="Vista 360 grados">
          <p className="text-xs font-bold uppercase tracking-wider text-neutral-500">360° · visor</p>
          <div className="mt-3 overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-50 shadow-inner">
            {glo3d.map((src) => (
              <iframe
                key={src}
                title={`Vista interactiva — ${label || "vehículo"}`}
                src={src}
                className="aspect-[16/10] min-h-[280px] w-full bg-white"
                allow="fullscreen; gyroscope"
                loading="lazy"
                referrerPolicy="strict-origin-when-cross-origin"
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
              />
            ))}
          </div>
        </section>
      ) : null}

      {statics.length > 0 && glo3d.length === 0 ? (
        <section aria-label="Galería de fotografías">
          <p className="text-xs font-bold uppercase tracking-wider text-neutral-500">Fotografías y miniaturas</p>

          <div className="mt-3 rounded-2xl border border-neutral-200 bg-neutral-50/80 p-3 sm:p-4">
            {mainStill ? (
              <div className="relative aspect-[16/10] overflow-hidden rounded-xl bg-neutral-200">
                {useOptimizer ? (
                  <Image
                    src={mainStill}
                    alt={label ? `Imagen principal — ${label}` : "Imagen del lote"}
                    fill
                    className={mainContainClass}
                    sizes="(max-width: 768px) 100vw, 720px"
                    priority={photoIndex === 0}
                  />
                ) : (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={mainStill}
                    alt={label ? `Imagen principal — ${label}` : "Imagen del lote"}
                    className={`h-full w-full ${mainContainClass}`}
                    loading={photoIndex === 0 ? "eager" : "lazy"}
                    decoding="async"
                  />
                )}
              </div>
            ) : null}

            {statics.length > 1 ? (
              <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
                {statics.map((src, idx) => (
                  <button
                    key={src}
                    type="button"
                    onClick={() => setPhotoIndex(idx)}
                    aria-label={`Ver miniatura ${idx + 1}`}
                    className={`relative h-14 w-[4.75rem] shrink-0 overflow-hidden rounded-lg border bg-white md:h-[4.75rem] md:w-24 ${
                      idx === photoIndex ? "border-[#009ade] ring-2 ring-[#009ade]/30" : "border-neutral-200 opacity-80 hover:opacity-100"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" />
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

    </div>
  );
}
