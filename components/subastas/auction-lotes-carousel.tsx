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
  favoriteLoteIds?: Set<string>;
  onToggleFavorite?: (id: string) => void;
  compareLoteIds?: Set<string>;
  onToggleCompare?: (id: string) => void;
  /** Carrusel más bajo para dar protagonismo al detalle del lote seleccionado. */
  compact?: boolean;
};

export function AuctionLotesCarousel({
  lotes,
  activeId,
  onSelect,
  favoriteLoteIds,
  onToggleFavorite,
  compareLoteIds,
  onToggleCompare,
  compact = false,
}: Props) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  const scrollByCards = useCallback((dir: -1 | 1) => {
    const el = scrollerRef.current;
    if (!el) return;
    const card = el.querySelector<HTMLElement>("[data-lote-card]");
    const delta = card ? Math.round(card.offsetWidth + 16) * dir : Math.round(el.clientWidth * 0.8) * dir;
    el.scrollBy({ left: delta, behavior: "smooth" });
  }, []);

  if (!lotes.length) return null;

  const pad = compact ? "px-3 py-3 sm:px-4" : "px-4 py-4 sm:px-5";
  const stripPad = compact ? "gap-3 px-3 py-4 sm:gap-4 sm:px-4" : "gap-4 px-4 py-5 sm:gap-5 sm:px-5";
  const titleCls = compact
    ? "text-base font-black tracking-tight text-neutral-900 sm:text-[1.05rem]"
    : "text-lg font-black tracking-tight text-neutral-900 sm:text-xl";
  const subCls = compact ? "mt-0.5 text-xs text-neutral-500" : "mt-0.5 text-sm text-neutral-500";
  const arrowBtn = compact
    ? "inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/70 bg-white/90 text-neutral-700 shadow-[0_8px_24px_rgba(3,7,18,0.08)] backdrop-blur transition duration-200 hover:-translate-y-0.5 hover:border-[#009ade]/35 hover:text-[#0079ad] hover:shadow-[0_12px_28px_rgba(0,154,222,0.2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#009ade] focus-visible:ring-offset-2"
    : "inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/70 bg-white/90 text-neutral-700 shadow-[0_8px_24px_rgba(3,7,18,0.08)] backdrop-blur transition duration-200 hover:-translate-y-0.5 hover:border-[#009ade]/35 hover:text-[#0079ad] hover:shadow-[0_12px_28px_rgba(0,154,222,0.2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#009ade] focus-visible:ring-offset-2";

  return (
    <section
      className={`relative overflow-hidden rounded-xl border border-[#d9e6ef] bg-gradient-to-b from-white via-[#f9fcff] to-[#f2f8fd] shadow-[0_18px_48px_rgba(15,23,42,0.08)] ring-1 ring-white/70 ${compact ? "sm:rounded-xl" : "sm:rounded-[1.25rem]"}`}
      aria-label="Vehículos del remate"
    >
      <div className="pointer-events-none absolute -left-20 -top-20 h-48 w-48 rounded-full bg-[#009ade]/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 -right-20 h-56 w-56 rounded-full bg-cyan-200/25 blur-3xl" />

      <div className={`relative z-10 flex flex-wrap items-start justify-between gap-2 border-b border-[#dbe7f0] bg-white/80 backdrop-blur ${pad}`}>
        <div>
          <h2 className={titleCls}>Vehículos en este remate</h2>
          <p className={subCls}>
            Deslizá con el dedo o el mouse — estilo tipo carrusel de listados.
          </p>
        </div>
        <div className="flex shrink-0 gap-1.5 sm:gap-2">
          <button type="button" onClick={() => scrollByCards(-1)} className={arrowBtn} aria-label="Ver lotes anteriores">
            <IconChevron dir="left" />
          </button>
          <button type="button" onClick={() => scrollByCards(1)} className={arrowBtn} aria-label="Ver lotes siguientes">
            <IconChevron dir="right" />
          </button>
        </div>
      </div>

      <div
        ref={scrollerRef}
        className={`relative z-10 flex snap-x snap-mandatory overflow-x-auto scroll-pb-2 ${stripPad} [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gradient-to-r [&::-webkit-scrollbar-thumb]:from-[#8dd8ff] [&::-webkit-scrollbar-thumb]:to-[#56c0f2] [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-[#e6eef5]`}
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
          const isFav = favoriteLoteIds?.has(l.id) ?? false;
          const inCompare = compareLoteIds?.has(l.id) ?? false;

          const wSel = compact ? "w-[min(12.5rem,78vw)] sm:w-[13.25rem]" : "w-[min(18rem,82vw)] sm:w-[19rem]";
          const wNorm = compact ? "w-[min(12rem,76vw)] sm:w-[12.75rem]" : "w-[min(17.25rem,80vw)] sm:w-[18.25rem]";
          const cardPad = compact ? "px-2 py-2 sm:px-2.5 sm:py-2.5" : "px-3 py-3 sm:px-3.5 sm:py-3.5";
          const titleSize = compact ? "line-clamp-2 min-h-[2.15rem] text-xs font-bold leading-snug" : "line-clamp-2 min-h-[2.5rem] text-sm font-bold leading-snug";
          const priceSize = compact ? "pt-0.5 text-base font-black tabular-nums" : "pt-1 text-lg font-black tabular-nums";

          return (
            <button
              key={l.id}
              type="button"
              data-lote-card
              onClick={() => onSelect(l.id)}
              className={`group relative snap-start shrink-0 overflow-hidden text-left transition-all duration-300 ${
                selected ? wSel : wNorm
              } rounded-lg border bg-white/95 shadow-[0_12px_28px_rgba(15,23,42,0.10)] outline-none focus-visible:ring-2 focus-visible:ring-[#009ade] focus-visible:ring-offset-2 sm:rounded-xl ${
                selected
                  ? "border-[#009ade] shadow-[0_16px_36px_rgba(0,154,222,0.28)] ring-2 ring-[#009ade]/35"
                  : "border-[#d8e3eb] hover:-translate-y-0.5 hover:border-[#b5d9ec] hover:shadow-[0_16px_34px_rgba(15,23,42,0.16)]"
              }`}
            >
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#f6fbff]/70" />
              <div className={`relative w-full overflow-hidden rounded-t-lg bg-neutral-100 sm:rounded-t-xl ${compact ? "aspect-[5/3.2]" : "aspect-[5/3]"}`}>
                {thumb ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={thumb}
                    alt=""
                    className={`h-full w-full object-cover transition duration-500 ${selected ? "scale-[1.03]" : "group-hover:scale-[1.05]"}`}
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-1 px-2 text-center text-xs text-neutral-400">
                    <span className="font-medium text-neutral-500">Sin imagen</span>
                    <span>{plate}</span>
                  </div>
                )}
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/30 to-transparent" />
                {onToggleFavorite ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleFavorite(l.id);
                    }}
                    className={`absolute right-1.5 top-1.5 inline-flex h-7 w-7 items-center justify-center rounded-full border text-sm ${
                      isFav
                        ? "border-amber-300 bg-amber-400 text-neutral-900"
                        : "border-white/65 bg-black/35 text-white hover:bg-black/55"
                    }`}
                    aria-label={isFav ? "Quitar favorito" : "Guardar favorito"}
                    title={isFav ? "Quitar favorito" : "Guardar favorito"}
                  >
                    ★
                  </button>
                ) : null}
                {selected ? (
                  <span
                    className={`absolute left-1.5 top-1.5 rounded-full border border-white/60 bg-[#009ade]/95 font-bold uppercase tracking-wide text-white shadow-lg backdrop-blur-sm ${compact ? "px-1.5 py-0.5 text-[8px]" : "left-2 top-2 px-2.5 py-0.5 text-[10px]"}`}
                  >
                    Seleccionado
                  </span>
                ) : null}
              </div>
              <div className={`relative space-y-0.5 border-t border-[#e5edf3] bg-gradient-to-b from-white to-[#f8fbff] ${cardPad}`}>
                <div className="flex items-start justify-between gap-1.5">
                  <p className={`${titleSize} text-neutral-900 transition-colors ${selected ? "text-[#0f172a]" : "group-hover:text-[#0b3b54]"}`}>{title}</p>
                  <span
                    className={`shrink-0 rounded-md border border-[#d8e7f2] bg-[#f2f8fd] font-semibold tabular-nums text-neutral-600 ${compact ? "px-1 py-0.5 text-[10px]" : "px-1.5 py-0.5 text-[11px]"}`}
                  >
                    {i + 1}/{lotes.length}
                  </span>
                </div>
                <div className={`flex items-center gap-1 text-neutral-500 ${compact ? "text-[10px]" : "text-xs"}`}>
                  <span className="truncate">{plate}</span>
                  {año ? <span className="text-neutral-300">·</span> : null}
                  {año ? <span>{año}</span> : null}
                </div>
                <p className={`${priceSize} ${selected ? "text-[#006a98]" : "text-neutral-900"} transition-colors`}>{formatClp(l.precio_base)}</p>
                <p className={`font-semibold uppercase tracking-wide text-neutral-400 ${compact ? "text-[9px]" : "text-[10px]"}`}>Precio base</p>
                {onToggleCompare ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleCompare(l.id);
                    }}
                    className={`mt-1 inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold ${
                      inCompare
                        ? "border-[#009ade]/40 bg-[#009ade]/10 text-[#006a98]"
                        : "border-neutral-300 text-neutral-600 hover:bg-neutral-50"
                    }`}
                  >
                    {inCompare ? "En comparador" : "Comparar"}
                  </button>
                ) : null}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
