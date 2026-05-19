"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { PortalRemateRow } from "@/lib/portal-types";
import { classifyRemateForFeed, countdownLabelFromEndsAt, type RemateFeedSlice } from "@/lib/portal-remate-feed";
import { fetchRemateCarouselSlidesMap, type RemateCarouselSlide } from "@/lib/remate-cover-thumbnails";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/public-env";
import { catalogoHref } from "@/lib/site-config";
import { ShareIconMenuButton } from "@/components/share-icon-menu-button";

type AuctionTab = "actuales" | "proximas" | "cerradas";
type EstadoFiltro = "actual" | "upcoming" | "cerrado";

const DEMO_LOTES = [
  {
    titulo: "ESPECIAL VENTAS DIRECTAS",
    subtitulo: "Licitación abierta — revisa condición en bodega",
    estado: "abierta" as const,
    countdown: null as string | null,
  },
  {
    titulo: "Referencia liviano",
    subtitulo: "Aceptar ofertas finales",
    estado: "finales" as const,
    countdown: "00:42:18",
  },
  {
    titulo: "Referencia cerrada",
    subtitulo: "Remate finalizado — consulta histórico en catálogo",
    estado: "cerrada" as const,
    countdown: null,
  },
];

const TAB_LABEL: Record<AuctionTab, string> = {
  actuales: "Subastas actuales",
  proximas: "Próximas subastas",
  cerradas: "Subastas cerradas",
};

const SUB_LABEL: Record<EstadoFiltro, string> = {
  actual: "En curso",
  upcoming: "Próximo cierre",
  cerrado: "Histórico",
};

const TAB_CONFIG: Record<AuctionTab, { label: string; icon: string }> = {
  actuales: { label: "Actuales", icon: "●" },
  proximas: { label: "Próximas", icon: "◔" },
  cerradas: { label: "Cerradas", icon: "◌" },
};

function tabCountLabel(count: number): string {
  return count > 99 ? "99+" : String(Math.max(0, count));
}

function estadoBadge(estado: (typeof DEMO_LOTES)[number]["estado"]) {
  if (estado === "abierta") {
    return (
      <span className="inline-flex min-h-10 items-center rounded-lg bg-emerald-600 px-4 py-2 text-xs font-extrabold uppercase tracking-wide text-white ring-2 ring-emerald-500/30">
        Licitación abierta
      </span>
    );
  }
  if (estado === "finales") {
    return (
      <span className="inline-flex min-h-10 items-center rounded-lg bg-amber-400 px-4 py-2 text-xs font-extrabold uppercase tracking-wide text-neutral-900 ring-2 ring-amber-300/80">
        Ofertas finales
      </span>
    );
  }
  return (
    <span className="inline-flex min-h-10 items-center rounded-lg bg-neutral-500 px-4 py-2 text-xs font-extrabold uppercase tracking-wide text-white">
      Cerrada
    </span>
  );
}

function badgeForSlice(slice: RemateFeedSlice, remateEstado: PortalRemateRow["estado"]) {
  if (slice === "cerrada") {
    return (
      <span className="inline-flex min-h-10 items-center rounded-lg bg-neutral-500 px-4 py-2 text-xs font-extrabold uppercase tracking-wide text-white">
        Cerrada
      </span>
    );
  }
  if (slice === "proxima") {
    return (
      <span className="inline-flex min-h-10 items-center rounded-lg bg-amber-400 px-4 py-2 text-xs font-extrabold uppercase tracking-wide text-neutral-900 ring-2 ring-amber-300/80">
        Próximo inicio
      </span>
    );
  }
  if (remateEstado === "en_curso") {
    return (
      <span className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-extrabold uppercase tracking-wide text-white ring-2 ring-emerald-500/30">
        <span className="inline-block h-2 w-2 rounded-full bg-white/95 shadow-[0_0_0_3px_rgba(255,255,255,0.25)]" aria-hidden />
        En curso
      </span>
    );
  }
  return (
    <span className="inline-flex min-h-10 items-center rounded-lg bg-sky-600 px-4 py-2 text-xs font-extrabold uppercase tracking-wide text-white">
      Publicado
    </span>
  );
}

function tabToSlice(tab: AuctionTab): RemateFeedSlice {
  if (tab === "actuales") return "actual";
  if (tab === "proximas") return "proxima";
  return "cerrada";
}

const cardShell =
  "group flex flex-col overflow-hidden rounded-2xl border border-neutral-100 bg-white shadow-[0_14px_34px_rgba(15,23,42,0.08)] ring-1 ring-[#dbe8f5] transition hover:-translate-y-0.5 hover:shadow-[0_22px_52px_rgba(0,154,222,0.16)]";

const THUMB_VISIBLE = 4;

const EMPTY_SLIDES: RemateCarouselSlide[] = [];

type SpecIconName = "km" | "year" | "fuel" | "gear" | "engineTest" | "movementTest" | "keys" | "traction" | "airbags";
type LotSpec = { key: string; label: string; icon: SpecIconName; wide?: boolean };

function normalizeEventTextKey(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function sanitizeEventText(value: string | null | undefined, maxLen = 180): string {
  const raw = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!raw) return "";

  const collapsed = raw
    .replace(/\s*[\u00b7|]+\s*/g, " · ")
    .replace(/(remate\s*#?\s*[0-9]{3,6}\s*-\s*){2,}/gi, (match) => {
      const parts = match
        .split(/\s+-\s+/)
        .map((part) => part.trim())
        .filter(Boolean);
      return parts[0] ? `${parts[0]} - ` : match;
    })
    .trim();

  const parts = collapsed
    .split(/\s+-\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length <= 1) {
    return collapsed.length > maxLen ? `${collapsed.slice(0, maxLen - 1).trim()}…` : collapsed;
  }

  const seen = new Set<string>();
  const dedup: string[] = [];
  for (const part of parts) {
    const key = normalizeEventTextKey(part);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    dedup.push(part);
    if (dedup.length >= 8) break;
  }
  const merged = dedup.join(" - ") || collapsed;
  return merged.length > maxLen ? `${merged.slice(0, maxLen - 1).trim()}…` : merged;
}

type RawEntry = { key: string; path: string; value: unknown };

function normalizeKeyToken(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[\s\-.]+/g, "_")
    .trim();
}

function collectRawEntries(input: unknown, parentPath = ""): RawEntry[] {
  if (!input || typeof input !== "object" || Array.isArray(input)) return [];
  const source = input as Record<string, unknown>;
  const entries: RawEntry[] = [];
  for (const [rawKey, rawValue] of Object.entries(source)) {
    const key = normalizeKeyToken(rawKey);
    const path = parentPath ? `${parentPath}.${key}` : key;
    entries.push({ key, path, value: rawValue });
    if (rawValue && typeof rawValue === "object" && !Array.isArray(rawValue)) {
      entries.push(...collectRawEntries(rawValue, path));
    }
  }
  return entries;
}

function asDisplayValue(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "si" : "no";
  return null;
}

function getFirstRawValue(entries: RawEntry[], keys: string[]): string | null {
  const aliases = keys.map(normalizeKeyToken);
  for (const alias of aliases) {
    const exact = entries.find((e) => e.path === alias || e.key === alias);
    const exactValue = asDisplayValue(exact?.value);
    if (exactValue) return exactValue;
    const match = entries.find((e) => e.path.includes(alias) || alias.includes(e.key));
    const matchValue = asDisplayValue(match?.value);
    if (matchValue) return matchValue;
  }
  return null;
}

function normalizeMileage(value: string | null): string | null {
  if (!value) return null;
  const compact = value.trim();
  if (!compact) return null;
  const digits = compact.replace(/[^\d]/g, "");
  if (!digits) return compact;
  return `${Number(digits).toLocaleString("es-CL")} kms.`;
}

function normalizeBinaryStatus(value: string | null): "yes" | "no" | "unknown" | null {
  if (!value) return null;
  const normalized = value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (!normalized) return null;
  if (["si", "s", "yes", "y", "true", "1", "arranca", "se mueve", "se desplaza"].includes(normalized)) return "yes";
  if (["no", "n", "false", "0", "no arranca", "no se mueve", "no se desplaza"].includes(normalized)) return "no";
  return "unknown";
}

function statusLabel(value: string | null, opts: { yes: string; no?: string }): string | null {
  if (!value) return null;
  const status = normalizeBinaryStatus(value);
  if (status === "yes") return opts.yes;
  if (status === "no") return opts.no ?? `SIN ${opts.yes}`;
  const cleaned = value.trim();
  return cleaned ? cleaned.toUpperCase() : null;
}

function buildLotSpecs(slide: RemateCarouselSlide): LotSpec[] {
  const inv = (slide.inventario ?? {}) as Record<string, unknown>;
  const entries = collectRawEntries(inv);
  const mileage = normalizeMileage(getFirstRawValue(entries, ["kilometraje", "km", "kms", "odometro", "odómetro"]));
  const year = getFirstRawValue(entries, ["ano", "anio", "year"]);
  const fuel = getFirstRawValue(entries, ["combustible", "fuel", "tipo_combustible"]);
  const transmission = getFirstRawValue(entries, ["transmision", "transmisión", "caja", "transmission", "tipo_caja"]);
  const motor = statusLabel(getFirstRawValue(entries, ["prueba_motor", "motor_arranca", "arranca", "motor_funciona"]), {
    yes: "MOTOR ARRANCA",
    no: "MOTOR NO ARRANCA",
  });
  const movement = statusLabel(getFirstRawValue(entries, ["prueba_desplazamiento", "se_desplaza", "desplaza", "movimiento"]), {
    yes: "SE DESPLAZA",
    no: "NO SE DESPLAZA",
  });
  const keys = statusLabel(getFirstRawValue(entries, ["llaves", "keys", "has_keys", "tiene_llaves", "con_llaves"]), {
    yes: "CON LLAVES",
    no: "SIN LLAVES",
  });
  const traction = getFirstRawValue(entries, ["traccion", "traction", "4x4"]);
  const airbags = getFirstRawValue(entries, ["estado_airbags", "airbags", "eda", "airbag"]);

  const specs: LotSpec[] = [];
  if (mileage) specs.push({ key: "km", label: mileage, icon: "km" });
  if (year) specs.push({ key: "year", label: year, icon: "year" });
  if (fuel) specs.push({ key: "fuel", label: fuel.toUpperCase(), icon: "fuel" });
  if (transmission) specs.push({ key: "gear", label: transmission.toUpperCase(), icon: "gear" });
  if (motor) specs.push({ key: "engineTest", label: motor, icon: "engineTest", wide: true });
  if (movement) specs.push({ key: "movementTest", label: movement, icon: "movementTest", wide: true });
  if (keys) specs.push({ key: "keys", label: keys, icon: "keys", wide: true });
  if (traction) specs.push({ key: "traction", label: `TRACCION ${traction.toUpperCase()}`, icon: "traction", wide: true });
  if (airbags) specs.push({ key: "airbags", label: `AIRBAGS: ${airbags.toUpperCase()}`, icon: "airbags", wide: true });
  return specs.slice(0, 8);
}

function formatLotPrice(value: number | null): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return `$${value.toLocaleString("es-CL")}`;
}

function lotTitle(slide: RemateCarouselSlide): string {
  const inv = (slide.inventario ?? {}) as Record<string, unknown>;
  const marca = String(inv.marca ?? "").trim();
  const modelo = String(inv.modelo ?? "").trim();
  const ano = String(inv.ano ?? "").trim();
  return [marca, modelo, ano].filter(Boolean).join(" ") || "Vehículo disponible";
}

function lotCategory(slide: RemateCarouselSlide): string | null {
  const inv = (slide.inventario ?? {}) as Record<string, unknown>;
  const cat = String(inv.categoria ?? "").trim();
  return cat ? `Categoría: ${cat}` : null;
}

function SpecIcon({ icon }: { icon: SpecIconName }) {
  if (icon === "km")
    return (
      <svg viewBox="0 0 20 20" className="h-3.5 w-3.5 text-[#7a624f]" fill="none" aria-hidden>
        <circle cx="10" cy="10" r="6.8" stroke="currentColor" strokeWidth="1.6" />
        <path d="M10 10 13.5 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="10" cy="10" r="1.1" fill="currentColor" />
      </svg>
    );
  if (icon === "year")
    return (
      <svg viewBox="0 0 20 20" className="h-3.5 w-3.5 text-[#7a624f]" fill="none" aria-hidden>
        <rect x="3.5" y="4.5" width="13" height="11.5" rx="1.8" stroke="currentColor" strokeWidth="1.6" />
        <path d="M6.5 3.5v2M13.5 3.5v2M3.5 8h13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  if (icon === "fuel")
    return (
      <svg viewBox="0 0 20 20" className="h-3.5 w-3.5 text-[#7a624f]" fill="none" aria-hidden>
        <path d="M4.5 4.5h6v11h-6z" stroke="currentColor" strokeWidth="1.6" />
        <path d="M10.5 7h1.8l1.4 1.6v4.4a1.7 1.7 0 0 0 3.4 0V9.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  if (icon === "engineTest")
    return (
      <svg viewBox="0 0 20 20" className="h-3.5 w-3.5 text-[#7a624f]" fill="none" aria-hidden>
        <rect x="3.5" y="7" width="9.8" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.6" />
        <path d="M13.3 8.4h2.2M13.3 11.6h2.2M6.4 7V5.4M10.4 7V5.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  if (icon === "movementTest")
    return (
      <svg viewBox="0 0 20 20" className="h-3.5 w-3.5 text-[#7a624f]" fill="none" aria-hidden>
        <path d="M4 10h9.8M10.8 6l3.5 4-3.5 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  if (icon === "keys")
    return (
      <svg viewBox="0 0 20 20" className="h-3.5 w-3.5 text-[#7a624f]" fill="none" aria-hidden>
        <circle cx="7" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.6" />
        <path d="M9.5 10h6M13.5 10v1.8M15.5 10v1.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  if (icon === "traction")
    return (
      <svg viewBox="0 0 20 20" className="h-3.5 w-3.5 text-[#7a624f]" fill="none" aria-hidden>
        <circle cx="6" cy="14" r="1.7" stroke="currentColor" strokeWidth="1.6" />
        <circle cx="14" cy="14" r="1.7" stroke="currentColor" strokeWidth="1.6" />
        <path d="M5.5 12h9l-1-3.2H7.1L5.5 12Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
    );
  return (
    <svg viewBox="0 0 20 20" className="h-3.5 w-3.5 text-[#7a624f]" fill="none" aria-hidden>
      <circle cx="8.2" cy="7" r="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M4.8 14.8c.4-2 1.9-3.4 3.9-3.7M10.8 12.2h4.4M13 9.5v5.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function RemateLotsStrip({
  slides,
  remateId,
  altBase,
}: {
  slides: RemateCarouselSlide[];
  remateId: string;
  altBase: string;
}) {
  const n = slides.length;
  const slidesStableKey = useMemo(() => slides.map((s) => s.loteId).join("|"), [slides]);
  const maxStart = Math.max(0, n - THUMB_VISIBLE);
  const [carouselState, setCarouselState] = useState<{ key: string; start: number }>({
    key: slidesStableKey,
    start: 0,
  });
  const start = carouselState.key === slidesStableKey ? Math.min(carouselState.start, maxStart) : 0;

  useEffect(() => {
    if (n <= THUMB_VISIBLE) return;
    const id = window.setInterval(() => {
      setCarouselState((prev) => {
        const current = prev.key === slidesStableKey ? Math.min(prev.start, maxStart) : 0;
        return { key: slidesStableKey, start: current >= maxStart ? 0 : current + 1 };
      });
    }, 5200);
    return () => window.clearInterval(id);
  }, [n, maxStart, slidesStableKey]);

  function go(delta: number) {
    setCarouselState((prev) => {
      const current = prev.key === slidesStableKey ? Math.min(prev.start, maxStart) : 0;
      const next = current + delta;
      if (next < 0) return { key: slidesStableKey, start: maxStart };
      if (next > maxStart) return { key: slidesStableKey, start: 0 };
      return { key: slidesStableKey, start: next };
    });
  }

  if (n === 0) {
    return (
      <div className="relative min-h-[132px] w-full overflow-hidden rounded-xl border border-neutral-200/80 bg-gradient-to-br from-neutral-100 via-neutral-200 to-sky-100/35">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(51,199,227,0.2),transparent_55%)]" />
        <div className="absolute inset-0 flex items-center justify-center p-4">
          <span className="rounded-full bg-white/80 px-4 py-1.5 text-center text-xs font-semibold text-neutral-500 backdrop-blur-sm">
            Este remate aún no tiene fotos disponibles en sus lotes
          </span>
        </div>
      </div>
    );
  }

  function thumbHref(loteId: string) {
    return `/subastas/${remateId}?lote=${encodeURIComponent(loteId)}`;
  }

  function LotCard({
    slide,
    idx,
    loading,
  }: {
    slide: RemateCarouselSlide;
    idx: number;
    loading: "lazy" | "eager";
  }) {
    const specs = buildLotSpecs(slide);
    const category = lotCategory(slide);
    const price = formatLotPrice(slide.precio);
    const href = thumbHref(slide.loteId);
    return (
      <article className="flex h-full flex-col overflow-hidden rounded-lg border border-[#dfd4c7] bg-[#fcfaf7] shadow-[0_6px_14px_rgba(73,46,26,0.12)]">
        <div className="relative aspect-[16/10] overflow-hidden border-b border-[#dfd4c7]">
          <Link
            href={href}
            className="group/thumb block h-full w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[#009ade] focus-visible:ring-offset-2"
            aria-label={`Ver detalle del lote ${idx + 1} en la sala`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={slide.url}
              alt={`${altBase} — foto del lote ${idx + 1}`}
              className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover/thumb:scale-[1.02]"
              loading={loading}
            />
          </Link>
        </div>
        <div className="flex flex-1 flex-col p-2.5">
          <h4 className="line-clamp-2 text-[0.86rem] font-extrabold tracking-tight text-[#2f1f14]">{lotTitle(slide)}</h4>
          {specs.length > 0 ? (
            <div className="mt-2 rounded-md border border-amber-200/70 bg-[#fdfaf5] p-2">
              <div className="grid grid-cols-2 gap-x-2 gap-y-1.5 text-xs text-[#4f5a66]">
                {specs.map((spec) => (
                  <div key={spec.key} className={`flex items-center gap-1.5 ${spec.wide ? "col-span-2" : ""}`}>
                    <SpecIcon icon={spec.icon} />
                    <span className={`${spec.wide ? "text-[0.65rem] font-semibold uppercase leading-tight" : "truncate"} text-[#5a616d]`}>
                      {spec.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="mt-auto space-y-2 pt-2">
            <div className="min-h-[22px]">
              {category ? (
                <span className="inline-flex rounded-full border border-amber-300/70 bg-[#eddccf] px-2 py-0.5 text-[10px] font-semibold text-[#604734]">
                  {category}
                </span>
              ) : null}
            </div>
            <div className="border-t border-amber-200/70 pt-2">
              <p className="min-h-[30px] text-[1.2rem] font-extrabold tracking-tight text-[#673b1f]">{price ?? " "}</p>
            </div>
            <Link
              href={href}
              className="inline-flex h-8 w-full items-center justify-center rounded-lg bg-[#66cceb] px-3 py-2 text-[11px] font-bold text-[#0f1f2c] transition hover:brightness-105"
            >
              Ir a ofertar
            </Link>
          </div>
        </div>
      </article>
    );
  }

  if (n < THUMB_VISIBLE) {
    return (
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}
      >
        {slides.map((s, i) => (
          <LotCard key={s.loteId} slide={s} idx={i} loading={i === 0 ? "eager" : "lazy"} />
        ))}
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {Array.from({ length: THUMB_VISIBLE }).map((_, i) => {
          const slide = slides[start + i];
          const globalIdx = start + i;
          return (
            <div
              key={slide ? `thumb-${slide.loteId}-${globalIdx}` : `thumb-pad-${globalIdx}`}
              className="h-full"
            >
              {slide ? (
                <LotCard slide={slide} idx={globalIdx} loading={i === 0 && start === 0 ? "eager" : "lazy"} />
              ) : (
                <div className="h-full rounded-lg border border-neutral-200 bg-neutral-100/70" aria-hidden />
              )}
            </div>
          );
        })}
      </div>

      {maxStart > 0 ? (
        <>
          <div className="pointer-events-none absolute inset-y-0 left-0 flex w-10 items-center sm:w-11">
            <button
              type="button"
              onClick={() => go(-1)}
              className="pointer-events-auto ml-1 rounded-full bg-neutral-900/55 p-1.5 text-white shadow backdrop-blur-sm transition hover:bg-neutral-900/75"
              aria-label="Ver cuatro fotos anteriores"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
                <path strokeWidth="2" d="M15 6l-6 6 6 6" />
              </svg>
            </button>
          </div>
          <div className="pointer-events-none absolute inset-y-0 right-0 flex w-10 items-center justify-center sm:w-11">
            <button
              type="button"
              onClick={() => go(1)}
              className="pointer-events-auto mr-1 rounded-full bg-neutral-900/55 p-1.5 text-white shadow backdrop-blur-sm transition hover:bg-neutral-900/75"
              aria-label="Ver cuatro fotos siguientes"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
                <path strokeWidth="2" d="M9 18l6-6-6-6" />
              </svg>
            </button>
          </div>
          <p className="mt-2 text-center text-[11px] text-neutral-500">
            Puede hacer clic en una foto para abrir ese lote en la sala. Vista {start + 1}–{Math.min(start + THUMB_VISIBLE, n)} de {n}{" "}
            <span className="tabular-nums text-neutral-400">({start + 1}/{maxStart + 1})</span>
          </p>
        </>
      ) : (
        <p className="mt-2 text-center text-[11px] text-neutral-500">
          Haga clic en una foto para ver el detalle del lote.
        </p>
      )}
    </div>
  );
}

function DemoRemateLotsStrip() {
  const [start, setStart] = useState(0);
  const demoSlides = [
    "from-neutral-200 via-sky-100 to-neutral-100",
    "from-amber-100 via-neutral-100 to-sky-50",
    "from-neutral-300 via-neutral-100 to-emerald-50/70",
    "from-neutral-200 via-violet-100 to-neutral-100",
    "from-sky-100 via-neutral-200 to-neutral-100",
    "from-neutral-200 via-orange-100/80 to-neutral-100",
  ];

  useEffect(() => {
    const id = window.setInterval(() => setStart((s) => (s >= 2 ? 0 : s + 1)), 4800);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="relative rounded-xl border border-dashed border-neutral-200 bg-neutral-50/50 px-3 py-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {Array.from({ length: THUMB_VISIBLE }).map((_, i) => {
          const grad = demoSlides[(start + i) % demoSlides.length];
          return (
            <div key={`demo-slot-${start}-${i}`} className={`relative aspect-[16/10] overflow-hidden rounded-lg bg-gradient-to-br ${grad}`} aria-hidden>
              <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold uppercase tracking-wide text-neutral-600/80">
                Lote ejemplo
              </span>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-center text-[11px] text-neutral-500">
        Ejemplo: {THUMB_VISIBLE} fotos por vista (carrusel)
      </p>
    </div>
  );
}

export function AuctionFeed() {
  const cat = catalogoHref();
  // Siempre iniciar en "Actuales" para evitar abrir el historial por preferencia previa.
  const [tab, setTab] = useState<AuctionTab>("actuales");
  const [sub, setSub] = useState<EstadoFiltro>("actual");
  const [bundle, setBundle] = useState<
    | { kind: "loading" }
    | { kind: "demo" }
    | { kind: "live"; rows: PortalRemateRow[]; err: string | null }
  >({ kind: "loading" });

  useEffect(() => {
    async function pull() {
      if (!isSupabaseConfigured()) {
        setBundle({ kind: "demo" });
        return;
      }
      const sb = createClient();
      if (!sb) {
        setBundle({ kind: "demo" });
        return;
      }
      const { data, error } = await sb
        .from("portal_remates")
        .select("*")
        .in("estado", ["publicado", "en_curso", "cerrado"])
        .order("ends_at", { ascending: true });
      if (error) {
        setBundle({ kind: "live", rows: [], err: "No pudimos cargar los remates en este momento." });
        return;
      }
      setBundle({
        kind: "live",
        rows: ((data ?? []) as PortalRemateRow[]) || [],
        err: null,
      });
    }
    void pull();
  }, []);

  const useDemo = bundle.kind === "demo";
  const liveRows = useMemo(() => (bundle.kind === "live" ? bundle.rows : []), [bundle]);
  const liveError = bundle.kind === "live" ? bundle.err : null;
  const [, setTick] = useState(0);
  const [carouselMap, setCarouselMap] = useState<Record<string, RemateCarouselSlide[]>>({});

  const liveIdsKey =
    bundle.kind === "live" ? [...bundle.rows].map((r) => r.id).sort().join(",") : "";

  useEffect(() => {
    if (bundle.kind !== "live") return;
    const ids = liveRows.map((r) => r.id);
    if (!ids.length) return;

    let cancelled = false;

    async function loadCarousels() {
      const sb = createClient();
      if (!sb) return;
      try {
        const m = await fetchRemateCarouselSlidesMap(sb, ids);
        if (!cancelled) setCarouselMap(m);
      } catch {}
    }

    void loadCarousels();
    return () => {
      cancelled = true;
    };
  }, [bundle.kind, liveIdsKey, liveRows]);

  useEffect(() => {
    if (useDemo || bundle.kind === "loading") return;
    const id = window.setInterval(() => setTick((x) => x + 1), 1000);
    return () => window.clearInterval(id);
  }, [useDemo, bundle.kind]);

  const slicedLive = useMemo(() => {
    const want = tabToSlice(tab);
    const list = liveRows.filter((r) => classifyRemateForFeed(r) === want);
    const sign = tab === "cerradas" ? -1 : 1;
    return [...list].sort((a, b) => sign * (new Date(a.ends_at).getTime() - new Date(b.ends_at).getTime()));
  }, [liveRows, tab]);

  const tabCounts = useMemo(() => {
    if (useDemo) {
      return { actuales: 1, proximas: 1, cerradas: 1 };
    }
    let actuales = 0;
    let proximas = 0;
    let cerradas = 0;
    for (const row of liveRows) {
      const slice = classifyRemateForFeed(row);
      if (slice === "actual") actuales += 1;
      else if (slice === "proxima") proximas += 1;
      else cerradas += 1;
    }
    return { actuales, proximas, cerradas };
  }, [liveRows, useDemo]);

  const heading = useMemo(() => {
    if (bundle.kind === "loading") return "Subastas";
    return useDemo ? `${TAB_LABEL[tab]} · vista ${SUB_LABEL[sub]}` : TAB_LABEL[tab];
  }, [sub, tab, useDemo, bundle.kind]);

  const renderLiveSubtitle = useCallback((r: PortalRemateRow) => {
    const descripcion = sanitizeEventText(r.descripcion, 240);
    if (descripcion) {
      const tituloNorm = normalizeEventTextKey(sanitizeEventText(r.titulo, 160));
      const descripcionNorm = normalizeEventTextKey(descripcion);
      if (descripcionNorm && descripcionNorm !== tituloNorm) return descripcion;
    }
    return "Consulta la ficha y las condiciones en la sala oficial antes de ofertar.";
  }, []);

  return (
    <section
      aria-labelledby="sec-subastas"
      className="border-y border-neutral-200/90 bg-[radial-gradient(circle_at_14%_0%,rgba(0,154,222,0.08),transparent_38%),linear-gradient(180deg,#f5f9fd_0%,#ffffff_55%)]"
    >
      <div className="mx-auto max-w-7xl px-4 pb-8 pt-4 sm:px-6 sm:pb-10 sm:pt-5 lg:px-8">
        <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-wrap gap-1 rounded-full bg-white p-1.5 shadow-[0_8px_18px_rgba(15,23,42,0.08)] ring-1 ring-[#d8e4f3]">
            {(Object.keys(TAB_CONFIG) as AuctionTab[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2.5 text-xs font-bold uppercase tracking-wide transition sm:text-sm ${
                  tab === key
                    ? "bg-[#1a2332] text-[#FFC600] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]"
                    : "text-neutral-600 hover:bg-neutral-100"
                }`}
              >
                <span aria-hidden>{TAB_CONFIG[key].icon}</span>
                <span>{TAB_CONFIG[key].label}</span>
                <span
                  className={`inline-flex min-w-6 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-black ${
                    tab === key ? "bg-white/15 text-[#FFC600]" : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {tabCountLabel(tabCounts[key])}
                </span>
              </button>
            ))}
          </div>

          {useDemo ? (
            <div className="flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-wide">
              {(
                [
                  ["actual", "Actual"],
                  ["upcoming", "Próximo"],
                  ["cerrado", "Cerrado"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSub(key)}
                  className={`rounded-full border px-3.5 py-1.5 transition ${
                    sub === key
                      ? "border-[#009ade] bg-sky-50 text-[#005f8a] shadow-sm"
                      : "border-neutral-200 bg-white text-neutral-600 hover:border-[#AAAAAA]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : (
            <Link
              href="/subastas"
              className="text-xs font-bold uppercase tracking-wide text-[#009ade] hover:underline"
            >
              Ver sala completa →
            </Link>
          )}
        </div>

        <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="sec-subastas" className="text-2xl font-black tracking-tight text-neutral-900 md:text-3xl">
              {heading}
            </h2>
            <p className="mt-1 text-sm font-medium text-neutral-600">
              {bundle.kind === "loading"
                ? "Cargando remates publicados…"
                : useDemo
                  ? (
                      <>
                        Ejemplo visual: así lucirán las tarjetas cuando publiques remates reales desde el panel{" "}
                        <span className="font-medium text-neutral-800">Administración → Remates y lotes</span>.
                      </>
                    )
                  : "Encuentra aquí remates actuales, próximos y cerrados para seguir participando cuando quieras."}
            </p>
          </div>
          {useDemo ? (
            <p className="max-w-md rounded-lg border border-amber-200/80 bg-amber-50/90 px-3 py-2 text-xs text-amber-950">
              <span className="font-bold">Tip:</span> los contadores y estados se actualizan según fechas y estado del
              remate en la base.
            </p>
          ) : null}
          {!useDemo && liveError ? (
            <p className="max-w-md rounded-lg border border-amber-200/80 bg-amber-50/90 px-3 py-2 text-xs text-amber-950">
              {liveError}
            </p>
          ) : null}
        </div>

        {bundle.kind === "loading" ? (
          <div className="mx-auto flex w-full flex-col gap-7">
            {[0, 1, 2].map((k) => (
              <div key={k} className="overflow-hidden rounded-2xl border border-neutral-200/80 animate-pulse">
                <div className="border-b border-neutral-100 p-6">
                  <div className="h-7 w-1/2 rounded bg-neutral-200" />
                  <div className="mt-3 h-4 w-full rounded bg-neutral-100" />
                  <div className="mt-2 h-4 w-2/3 rounded bg-neutral-100" />
                  <div className="mt-4 h-3 w-40 rounded bg-neutral-200" />
                </div>
                <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-4">
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="aspect-[4/3] rounded-lg bg-gradient-to-br from-neutral-100 to-neutral-200/70" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : useDemo ? (
          <div className="mx-auto flex w-full flex-col gap-7">
            {DEMO_LOTES.map((lote, i) => (
              <article key={i} className={cardShell}>
                <div className="border-b border-neutral-100 px-5 pb-3 pt-4 sm:px-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <h3 className="line-clamp-2 min-w-0 flex-1 text-xl font-black tracking-tight text-neutral-900">{lote.titulo}</h3>
                    <div className="flex items-center gap-2">
                      <ShareIconMenuButton
                        shareUrl="/subastas"
                        title={lote.titulo}
                        text={`Revisa este remate en VEDISA Remates: ${lote.titulo}`}
                        buttonLabel="Compartir remate"
                        buttonVariant="secondary"
                      />
                      {estadoBadge(lote.estado)}
                    </div>
                  </div>
                  <p className="mt-2 line-clamp-1 text-sm font-medium text-neutral-600">{lote.subtitulo}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-2.5">
                    <span className="inline-flex min-h-9 items-center rounded-lg border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-bold text-sky-700">
                      Lotes disponibles: 12
                    </span>
                    {lote.countdown ? (
                      <p className="inline-flex min-h-9 items-center rounded-lg border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700">
                        <span className="mr-1.5">Cierre en</span>
                        <span className="tabular-nums font-extrabold">{lote.countdown}</span>
                      </p>
                    ) : null}
                  </div>
                  <div className="mt-3 border-t border-neutral-100 pt-3">
                    <span className="inline-flex min-h-10 items-center rounded-lg bg-[#0e6fa4] px-4 py-2 text-sm font-bold text-white">
                      Ver sala del remate
                    </span>
                  </div>
                </div>
                <div className="p-4 sm:p-5">
                  <DemoRemateLotsStrip />
                </div>
              </article>
            ))}
          </div>
        ) : slicedLive.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50/80 px-6 py-14 text-center">
            <p className="text-neutral-800">
              {tab === "actuales"
                ? "Por ahora no hay subastas activas en este momento."
                : tab === "proximas"
                  ? "Aún no hay subastas próximas publicadas."
                  : "Todavía no hay subastas cerradas para mostrar en el historial."}
            </p>
            <p className="mt-2 text-sm text-neutral-600">Te avisaremos en cuanto existan nuevas oportunidades para ofertar.</p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
              <Link href="/subastas" className="inline-block font-bold text-[#009ade] hover:underline">
                Ir a sala de subastas →
              </Link>
              <Link href={cat} target="_blank" rel="noopener noreferrer" className="inline-block font-bold text-[#009ade] hover:underline">
                Ver catálogo completo →
              </Link>
            </div>
          </div>
        ) : (
          <div className="mx-auto flex w-full flex-col gap-7">
            {slicedLive.map((r) => {
              const slice = classifyRemateForFeed(r);
              const cd = slice !== "cerrada" ? countdownLabelFromEndsAt(r.ends_at) : null;
              const slides = carouselMap[r.id] ?? EMPTY_SLIDES;
              const tituloLimpio = sanitizeEventText(r.titulo, 140) || "Remate";
              const descripcionLimpia =
                sanitizeEventText(renderLiveSubtitle(r), 240) ||
                "Consulta la ficha y las condiciones en la sala oficial antes de ofertar.";

              return (
                <article key={r.id} className={cardShell}>
                  <div className="border-b border-neutral-100 px-5 pb-3 pt-4 sm:px-6">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <h3 className="line-clamp-2 text-xl font-black tracking-tight text-neutral-900 sm:text-2xl">{tituloLimpio}</h3>
                        <p
                          className="mt-2 line-clamp-1 text-sm font-medium text-neutral-600 transition-all group-hover:line-clamp-2"
                          title={descripcionLimpia}
                        >
                          {descripcionLimpia}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <ShareIconMenuButton
                          shareUrl={`/subastas/${r.id}`}
                          title={tituloLimpio}
                          text={`Revisa este remate en VEDISA Remates: ${tituloLimpio}`}
                          buttonLabel="Compartir remate"
                          buttonVariant="secondary"
                        />
                        {badgeForSlice(slice, r.estado)}
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2.5">
                      <span className="inline-flex min-h-9 items-center rounded-lg border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-bold text-sky-700">
                        Lotes disponibles: {slides.length}
                      </span>
                      {cd ? (
                        <p className="inline-flex min-h-9 items-center rounded-lg border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700">
                          <span className="mr-1.5">Cierre en</span>
                          <span className="tabular-nums font-extrabold">{cd}</span>
                        </p>
                      ) : (
                        <p className="text-xs text-neutral-500">Cierre: {new Date(r.ends_at).toLocaleString("es-CL")}</p>
                      )}
                    </div>
                    <div className="mt-3 border-t border-neutral-100 pt-3">
                      <Link
                        href={`/subastas/${r.id}`}
                        className="inline-flex min-h-10 items-center rounded-lg bg-[#0e6fa4] px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-[#0b5f8d]"
                      >
                        Ir a la sala del remate
                      </Link>
                    </div>
                  </div>
                  <div className="p-4 sm:p-5">
                    <RemateLotsStrip slides={slides} remateId={r.id} altBase={tituloLimpio} />
                  </div>
                </article>
              );
            })}
          </div>
        )}

        <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:mt-8 sm:flex-row sm:gap-4">
          <Link
            href={cat}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[48px] min-w-[200px] items-center justify-center rounded-xl bg-[#1a2332] px-8 py-3 text-sm font-bold text-[#FFC600] shadow-lg transition hover:bg-[#252f3f]"
          >
            Ver catálogo completo
          </Link>
          <Link
            href="/como-participar"
            className="inline-flex min-h-[48px] items-center justify-center rounded-xl border-2 border-[#009ade] px-8 py-3 text-sm font-bold text-[#009ade] hover:bg-sky-50"
          >
            Cómo participar
          </Link>
        </div>
      </div>
    </section>
  );
}
