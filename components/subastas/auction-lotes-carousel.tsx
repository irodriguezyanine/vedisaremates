"use client";

import { useCallback, useRef } from "react";

import { formatClp } from "@/lib/format-clp";
import { preferredThumbnailUrl } from "@/lib/inventario-media";
import type { InventarioRow, PortalRemateLoteRow } from "@/lib/portal-types";

type Lote = PortalRemateLoteRow & { inventario: InventarioRow | null };

function IconChevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      {dir === "left" ? (
        <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  );
}

type Props = {
  lotes: Lote[];
  activeId: string | null;
  onSelect: (id: string) => void;
};

export function AuctionLotesCarousel({ lotes, activeId, onSelect }: Props) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  const scrollByCards = useCallback((dir: -1 | 1) => {
    const el = scrollerRef.current;
    if (!el) return;
    const card = el.querySelector<HTMLElement>("[data-lote-card]");
    const delta = card ? Math.round(card.offsetWidth + 16) * dir : Math.round(el.clientWidth * 0.8) * dir;
    el.scrollBy({ left: delta, behavior: "smooth" });
  }, []);

  if (!lotes.length) return null;

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white shadow-sm sm:rounded-[1.25rem]" aria-label="Vehículos del remate">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-neutral-100 px-4 py-4 sm:px-5">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-neutral-900 sm:text-xl">Vehículos en este remate</h2>
          <p className="mt-0.5 text-sm text-neutral-500">
            Deslizá con el dedo o el mouse — estilo tipo carrusel de listados.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => scrollByCards(-1)}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-700 shadow-sm transition hover:border-neutral-300 hover:bg-neutral-50"
            aria-label="Ver lotes anteriores"
          >
            <IconChevron dir="left" />
          </button>
          <button
            type="button"
            onClick={() => scrollByCards(1)}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-700 shadow-sm transition hover:border-neutral-300 hover:bg-neutral-50"
            aria-label="Ver lotes siguientes"
          >
            <IconChevron dir="right" />
          </button>
        </div>
      </div>

      <div
        ref={scrollerRef}
        className="flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-pb-2 px-4 py-5 sm:gap-5 sm:px-5 [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-neutral-300"
        style={{ scrollbarWidth: "thin" }}
      >
        {lotes.map((l, i) => {
          const inv = l.inventario as (InventarioRow & Record<string, unknown>) | null;
          const thumb = inv ? preferredThumbnailUrl(inv) : null;
          const title =
            inv && [inv.marca, inv.modelo].filter(Boolean).length > 0
              ? [inv.marca, inv.modelo].filter(Boolean).join(" ")
              : (l.titulo ?? `Lote ${i + 1}`);
          const plate = inv?.patente ?? `Lote ${i + 1}`;
          const año = inv?.ano ? String(inv.ano).trim() : "";
          const selected = l.id === activeId;

          return (
            <button
              key={l.id}
              type="button"
              data-lote-card
              onClick={() => onSelect(l.id)}
              className={`snap-start shrink-0 text-left transition-shadow ${
                selected
                  ? "w-[min(18rem,82vw)] sm:w-[19rem]"
                  : "w-[min(17.25rem,80vw)] sm:w-[18.25rem]"
              } rounded-xl border bg-white shadow-sm outline-none hover:shadow-md focus-visible:ring-2 focus-visible:ring-[#009ade] focus-visible:ring-offset-2 ${
                selected ? "border-[#009ade] shadow-md ring-2 ring-[#009ade]/35" : "border-neutral-200 hover:border-neutral-300"
              }`}
            >
              <div className="relative aspect-[5/3] w-full overflow-hidden rounded-t-xl bg-neutral-100">
                {thumb ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={thumb} alt="" className="h-full w-full object-cover" loading="lazy" />
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-1 px-2 text-center text-xs text-neutral-400">
                    <span className="font-medium text-neutral-500">Sin imagen</span>
                    <span>{plate}</span>
                  </div>
                )}
                {selected ? (
                  <span className="absolute left-2 top-2 rounded bg-[#009ade] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow">
                    Seleccionado
                  </span>
                ) : null}
              </div>
              <div className="space-y-1 border-t border-neutral-100 px-3 py-3 sm:px-3.5 sm:py-3.5">
                <div className="flex items-start justify-between gap-2">
                  <p className="line-clamp-2 min-h-[2.5rem] text-sm font-bold leading-snug text-neutral-900">{title}</p>
                  <span className="shrink-0 rounded-md bg-neutral-100 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-neutral-600">
                    {i + 1}/{lotes.length}
                  </span>
                </div>
                <div className="flex items-center gap-1 text-xs text-neutral-500">
                  <span className="truncate">{plate}</span>
                  {año ? <span className="text-neutral-300">·</span> : null}
                  {año ? <span>{año}</span> : null}
                </div>
                <p className="pt-1 text-lg font-black tabular-nums text-neutral-900">{formatClp(l.precio_base)}</p>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">Precio base</p>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
