"use client";

import Image from "next/image";
import { useMemo, useState } from "react";

import type { InventarioRow } from "@/lib/portal-types";
import {
  bucketGlo3dViewerUrls,
  bucketInventarioStaticImages,
  collectInventarioMediaUrls,
} from "@/lib/inventario-media";

type Props = {
  inventario: (InventarioRow & Record<string, unknown>) | null;
};

export function InventarioMediaGallery({ inventario }: Props) {
  const [photoIndex, setPhotoIndex] = useState(0);

  const { statics, glo3d } = useMemo(() => {
    if (!inventario) return { statics: [] as string[], glo3d: [] as string[] };
    const all = collectInventarioMediaUrls(inventario);
    return {
      statics: bucketInventarioStaticImages(all),
      glo3d: bucketGlo3dViewerUrls(all),
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

  const hostname = mainStill ? (() => {
    try {
      return new URL(mainStill).hostname.toLowerCase();
    } catch {
      return "";
    }
  })() : "";

  const useOptimizer =
    !!mainStill &&
    (/\bcloudinary\b/i.test(mainStill) ||
      hostname.endsWith("supabase.co") ||
      hostname.includes("cloudinary"));

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

      {statics.length ? (
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
                    className="object-contain"
                    sizes="(max-width: 768px) 100vw, 720px"
                    priority={photoIndex === 0}
                  />
                ) : (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={mainStill}
                    alt={label ? `Imagen principal — ${label}` : "Imagen del lote"}
                    className="h-full w-full object-contain"
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

      {!statics.length && glo3d.length ? (
        <p className="text-sm text-neutral-500">
          Este ítem solo tiene visor interactivo 360°. Si completás también URLs de imagen plana en el inventario Tasaciones,
          verás fotos y miniaturas como en el catálogo.
        </p>
      ) : null}
    </div>
  );
}
