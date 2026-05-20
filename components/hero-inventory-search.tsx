"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { VehicleSpecGrid } from "@/components/vehicle-spec-grid";
import { getInventarioStaticImageUrls, preferredThumbnailUrl } from "@/lib/inventario-media";
import { etiquetaCategoriaHumana } from "@/lib/nav-ver-stats";
import type { InventarioRow } from "@/lib/portal-types";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/public-env";
import { getInventarioField, getVehicleSpecs } from "@/lib/vehicle-spec-summary";

type InventarioAnyRow = InventarioRow & Record<string, unknown>;
type BoolFilter = "todos" | "si" | "no";
type LoteJoinRow = {
  id?: string | null;
  inventario: InventarioAnyRow | InventarioAnyRow[] | null;
  portal_remates:
    | { id?: string | null; estado?: string | null; titulo?: string | null; descripcion?: string | null }
    | Array<{ id?: string | null; estado?: string | null; titulo?: string | null; descripcion?: string | null }>
    | null;
};
type SearchRow = {
  inventario: InventarioAnyRow;
  remateId: string | null;
  remateEstado: string | null;
};

const IMAGE_HINT_KEYS = [
  "glo3d_thumbnail",
  "glo3d_thumb",
  "thumbnail_url",
  "foto_principal",
  "imagen_principal",
  "image_url",
  "imagen_url",
  "photo_url",
];

function normalize(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function normalizeSearchToken(value: string): string {
  return String(value ?? "")
    .replace(/[,()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseBoolish(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1 ? true : value === 0 ? false : null;
  const t = normalize(value);
  if (!t) return null;
  if (["si", "sí", "true", "1", "ok", "activo", "operativo", "arranca"].includes(t)) return true;
  if (["no", "false", "0", "inactivo", "inoperativo", "no arranca"].includes(t)) return false;
  return null;
}

function unwrapEmb<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

function rowMatchesText(row: InventarioAnyRow, query: string): boolean {
  const q = normalize(query);
  if (!q) return true;
  return Object.values(row).some((value) => {
    if (value == null) return false;
    if (typeof value === "object") return false;
    return normalize(value).includes(q);
  });
}

function rowMatchesBoolFilter(row: InventarioAnyRow, keys: string[], filter: BoolFilter): boolean {
  if (filter === "todos") return true;
  const wanted = filter === "si";
  for (const key of keys) {
    if (!(key in row)) continue;
    const boolValue = parseBoolish(row[key]);
    if (boolValue == null) continue;
    return boolValue === wanted;
  }
  return false;
}

function isHttpUrl(value: unknown): value is string {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}

function firstHttpUrl(value: unknown): string | null {
  if (isHttpUrl(value)) return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const hit = firstHttpUrl(item);
      if (hit) return hit;
    }
  }
  if (value && typeof value === "object") {
    for (const v of Object.values(value as Record<string, unknown>)) {
      const hit = firstHttpUrl(v);
      if (hit) return hit;
    }
  }
  return null;
}

function findUrlByHintKeys(row: InventarioAnyRow, hintKeys: string[]): string | null {
  const entries = Object.entries(row);
  for (const [key, value] of entries) {
    const k = normalize(key);
    if (!hintKeys.some((h) => k.includes(h))) continue;
    const hit = firstHttpUrl(value);
    if (hit) return hit;
  }
  return null;
}

function thumbnailCandidates(row: InventarioAnyRow): string[] {
  const candidates: string[] = [];
  for (const u of getInventarioStaticImageUrls(row)) {
    if (!candidates.includes(u)) candidates.push(u);
  }
  const preferred = preferredThumbnailUrl(row);
  if (preferred && !candidates.includes(preferred)) candidates.unshift(preferred);
  const hinted = findUrlByHintKeys(row, IMAGE_HINT_KEYS);
  if (hinted && !candidates.includes(hinted)) candidates.push(hinted);
  const fallback = firstHttpUrl(row);
  if (fallback && !candidates.includes(fallback)) candidates.push(fallback);
  return candidates;
}

function formatClpFromUnknown(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return `$${value.toLocaleString("es-CL")}`;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value.replace(/[^\d-]/g, ""));
    if (Number.isFinite(n)) return `$${n.toLocaleString("es-CL")}`;
  }
  return null;
}

function vehicleTitle(row: InventarioAnyRow): string {
  const marca = String(row.marca ?? "").trim();
  const modelo = String(row.modelo ?? "").trim();
  const version = String(row.version ?? "").trim();
  const ano = String(row.ano ?? "").trim();
  const text = [marca, modelo, version, ano].filter(Boolean).join(" ");
  return text ? `VEDISA Remates - ${text}` : "VEDISA Remates - Vehículo disponible";
}

function vehicleDescription(row: InventarioAnyRow): string {
  const descripcion = String(row.descripcion ?? "").replace(/\s+/g, " ").trim();
  if (descripcion) return descripcion.toUpperCase();
  const fallback = [String(row.marca ?? ""), String(row.modelo ?? "")].filter(Boolean).join(" ").trim();
  return fallback ? `${fallback.toUpperCase()} DISPONIBLE PARA OFERTAR` : "VEHÍCULO DISPONIBLE PARA OFERTAR";
}

function vehicleLotLabel(row: InventarioAnyRow): string | null {
  const lot = getInventarioField(row, ["csv_lote", "lote", "lot", "numero_lote"]);
  return lot ? `Lote ${lot}` : null;
}

function vehicleCategoryLabel(row: InventarioAnyRow): string | null {
  const cat = String(row.categoria ?? "").trim();
  if (!cat) return null;
  return `Categoría: ${etiquetaCategoriaHumana(cat)}`;
}

function SearchCardImage({ inventario }: { inventario: InventarioAnyRow }) {
  const candidates = useMemo(() => thumbnailCandidates(inventario), [inventario]);
  const sourceKey = `${String(inventario.id ?? "")}:${candidates.join("|")}`;
  const [state, setState] = useState<{ key: string; index: number }>({ key: sourceKey, index: 0 });
  const index = state.key === sourceKey ? state.index : 0;
  const src = candidates[index] ?? null;

  if (!src) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#15263a] to-[#0b1624] text-xs font-semibold text-slate-300">
        Sin miniatura
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={`${String(inventario.marca ?? "")} ${String(inventario.modelo ?? "")}`.trim() || "Vehiculo"}
      className="h-full w-full object-cover"
      loading="lazy"
      onError={() => {
        setState((prev) => {
          const nextIndex = prev.key === sourceKey ? prev.index + 1 : 1;
          return { key: sourceKey, index: nextIndex };
        });
      }}
    />
  );
}

const MAX_FETCH = 4000;
const MAX_RENDER = 12;
const REMATES_OFERTABLES = ["publicado", "en_curso"];

export function HeroInventorySearch({
  onSearchActiveChange,
}: {
  onSearchActiveChange?: (isActive: boolean) => void;
}) {
  const [q, setQ] = useState("");
  const [marca, setMarca] = useState("");
  const [categoria, setCategoria] = useState("");
  const [yearFrom, setYearFrom] = useState("");
  const [yearTo, setYearTo] = useState("");
  const [operativo, setOperativo] = useState<BoolFilter>("todos");
  const [motorArranca, setMotorArranca] = useState<BoolFilter>("todos");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [rows, setRows] = useState<SearchRow[]>([]);
  const [searched, setSearched] = useState(false);

  const hasAnyFilter =
    Boolean(q.trim()) ||
    Boolean(marca.trim()) ||
    Boolean(categoria.trim()) ||
    Boolean(yearFrom.trim()) ||
    Boolean(yearTo.trim()) ||
    operativo !== "todos" ||
    motorArranca !== "todos";
  const visibleRows = useMemo(() => (hasAnyFilter ? rows.slice(0, MAX_RENDER) : []), [hasAnyFilter, rows]);

  useEffect(() => {
    onSearchActiveChange?.(hasAnyFilter);
  }, [hasAnyFilter, onSearchActiveChange]);

  const searchInventory = useCallback(async () => {
    setErr(null);
    setSearched(true);
    if (!hasAnyFilter) {
      setRows([]);
      return;
    }
    if (!isSupabaseConfigured()) {
      setErr("Búsqueda no disponible en este entorno.");
      setRows([]);
      return;
    }
    const sb = createClient();
    if (!sb) {
      setErr("Servicio de datos no disponible.");
      setRows([]);
      return;
    }

    setLoading(true);
    try {
      const searchToken = normalizeSearchToken(q);
      const { data, error } = await sb
        .from("portal_remate_lotes")
        .select(
          `
          id,
          inventario(*),
          portal_remates(id,estado,titulo,descripcion)
        `,
        )
        .order("created_at", { ascending: false })
        .limit(MAX_FETCH);
      if (error) {
        setErr("No se pudo consultar inventario. Intenta nuevamente.");
        setRows([]);
        return;
      }

      const byId = new Map<string, SearchRow>();
      for (const raw of ((data ?? []) as LoteJoinRow[])) {
        const remate = unwrapEmb(raw.portal_remates);
        const estado = normalize(remate?.estado);
        if (!REMATES_OFERTABLES.includes(estado)) continue;
        const inv = unwrapEmb(raw.inventario);
        if (!inv?.id) continue;
        const inventarioId = String(inv.id);
        if (!byId.has(inventarioId)) {
          byId.set(inventarioId, {
            inventario: inv,
            remateId: typeof remate?.id === "string" ? remate.id : null,
            remateEstado: estado || null,
          });
        }
      }

      let result = [...byId.values()];

      if (searchToken) result = result.filter((row) => rowMatchesText(row.inventario, searchToken));
      if (marca.trim()) result = result.filter((row) => normalize(row.inventario.marca).includes(normalize(marca)));
      if (categoria.trim()) result = result.filter((row) => normalize(row.inventario.categoria).includes(normalize(categoria)));
      if (yearFrom.trim()) {
        const minYear = Number(yearFrom);
        if (Number.isFinite(minYear)) {
          result = result.filter((row) => Number(row.inventario.ano ?? 0) >= minYear);
        }
      }
      if (yearTo.trim()) {
        const maxYear = Number(yearTo);
        if (Number.isFinite(maxYear)) {
          result = result.filter((row) => Number(row.inventario.ano ?? 0) <= maxYear);
        }
      }

      result = result.filter((row) =>
        rowMatchesBoolFilter(row.inventario, ["operativo", "es_operativo", "estado_operativo", "funciona"], operativo),
      );
      result = result.filter((row) =>
        rowMatchesBoolFilter(row.inventario, ["motor_arranca", "arranca", "motor_funciona"], motorArranca),
      );

      setRows(result);
    } finally {
      setLoading(false);
    }
  }, [categoria, hasAnyFilter, marca, motorArranca, operativo, q, yearFrom, yearTo]);

  useEffect(() => {
    if (!hasAnyFilter) return;
    const timer = window.setTimeout(() => {
      void searchInventory();
    }, 250);
    return () => window.clearTimeout(timer);
  }, [hasAnyFilter, searchInventory]);

  return (
    <section className="w-full border-b border-white/10 bg-[#0b1624]">
      <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-[#2a3a53] bg-gradient-to-b from-[#132235] to-[#101d2e] p-3 shadow-[0_20px_40px_-24px_rgba(0,0,0,0.8)]">
          <div className="flex flex-col gap-3 lg:flex-row">
            <div className="flex-1">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar por marca, patente, VIN, motor, modelo o cualquier dato del inventario..."
                className="h-12 w-full rounded-xl border border-[#365072] bg-[#0a1523] px-4 text-sm text-white placeholder:text-slate-400 focus:border-[#33C7E3] focus:outline-none"
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setFiltersOpen((v) => !v)}
                className="inline-flex h-12 items-center gap-2 rounded-xl border border-[#365072] bg-[#0a1523] px-4 text-sm font-semibold text-slate-200 hover:border-[#33C7E3]"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
                  <path strokeWidth="2" strokeLinecap="round" d="M4 6h16M7 12h10M10 18h4" />
                </svg>
                Filtros
              </button>
              <span className="inline-flex h-12 items-center rounded-xl border border-[#365072] bg-[#0a1523] px-4 text-xs font-semibold text-slate-300">
                {loading ? "Buscando..." : "Búsqueda automática"}
              </span>
            </div>
          </div>

          {filtersOpen ? (
            <div className="mt-3 grid gap-3 rounded-xl border border-[#2a3a53] bg-[#0b1624] p-3 md:grid-cols-3 lg:grid-cols-6">
              <input
                value={marca}
                onChange={(e) => setMarca(e.target.value)}
                placeholder="Marca"
                className="h-10 rounded-lg border border-[#365072] bg-[#0a1523] px-3 text-sm text-white placeholder:text-slate-400"
              />
              <input
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
                placeholder="Categoría"
                className="h-10 rounded-lg border border-[#365072] bg-[#0a1523] px-3 text-sm text-white placeholder:text-slate-400"
              />
              <input
                value={yearFrom}
                onChange={(e) => setYearFrom(e.target.value)}
                placeholder="Año desde"
                className="h-10 rounded-lg border border-[#365072] bg-[#0a1523] px-3 text-sm text-white placeholder:text-slate-400"
              />
              <input
                value={yearTo}
                onChange={(e) => setYearTo(e.target.value)}
                placeholder="Año hasta"
                className="h-10 rounded-lg border border-[#365072] bg-[#0a1523] px-3 text-sm text-white placeholder:text-slate-400"
              />
              <select
                value={motorArranca}
                onChange={(e) => setMotorArranca(e.target.value as BoolFilter)}
                className="h-10 rounded-lg border border-[#365072] bg-[#0a1523] px-3 text-sm text-white"
              >
                <option value="todos">Motor arranca: todos</option>
                <option value="si">Motor arranca: sí</option>
                <option value="no">Motor arranca: no</option>
              </select>
              <select
                value={operativo}
                onChange={(e) => setOperativo(e.target.value as BoolFilter)}
                className="h-10 rounded-lg border border-[#365072] bg-[#0a1523] px-3 text-sm text-white"
              >
                <option value="todos">Operativo: todos</option>
                <option value="si">Operativo: sí</option>
                <option value="no">Operativo: no</option>
              </select>
            </div>
          ) : null}

          {err ? <p className="mt-3 text-sm text-red-300">{err}</p> : null}
          {hasAnyFilter && searched && !loading ? (
            <p className="mt-3 text-xs text-slate-400">
              Resultados: {rows.length} {rows.length === 1 ? "vehículo" : "vehículos"}.
              {rows.length > MAX_RENDER ? ` Mostrando los primeros ${MAX_RENDER}.` : ""}
            </p>
          ) : null}

          {hasAnyFilter && searched && !loading && !visibleRows.length ? (
            <div className="mt-4 rounded-xl border border-dashed border-[#365072] bg-[#0a1523] px-4 py-8 text-center">
              <p className="text-sm font-semibold text-slate-200">No encontramos vehiculos con esos filtros.</p>
              <p className="mt-1 text-xs text-slate-400">Prueba otra marca, patente o un rango de anio mas amplio.</p>
            </div>
          ) : null}

          {visibleRows.length ? (
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {visibleRows.map((row) => {
                const specs = getVehicleSpecs(row.inventario);
                const lotLabel = vehicleLotLabel(row.inventario);
                const categoryLabel = vehicleCategoryLabel(row.inventario);
                const priceLabel = formatClpFromUnknown(row.inventario.precio_minimo_remate ?? row.inventario.valor_minimo);

                return (
                  <article
                    key={String(row.inventario.id)}
                    className="flex h-full flex-col overflow-hidden rounded-xl border border-[#d6e5f4] bg-[#f8fbff] text-left shadow-[0_8px_18px_rgba(15,45,80,0.12)]"
                  >
                    <div className="relative aspect-[16/9] w-full overflow-hidden border-b border-[#d6e5f4]">
                      <SearchCardImage inventario={row.inventario} />
                    </div>

                    <div className="flex flex-1 flex-col p-3">
                      <div className="space-y-2.5">
                        <div className="min-h-[104px]">
                          <h3 className="line-clamp-2 min-h-[52px] text-[0.98rem] font-extrabold tracking-tight text-[#2f1f14]">
                            {vehicleTitle(row.inventario)}
                          </h3>
                          <p className="line-clamp-2 min-h-[44px] text-[0.82rem] text-[#6c5440]">{vehicleDescription(row.inventario)}</p>
                        </div>

                        {specs.length > 0 ? <VehicleSpecGrid specs={specs} size="sm" /> : null}
                      </div>

                      <div className="mt-auto space-y-2.5 pt-2.5">
                        <div className="min-h-[24px]">
                          <div className="flex flex-wrap gap-1.5 text-[11px] text-[#35506d]">
                            {lotLabel ? <span className="rounded-full border border-sky-200 bg-[#eaf3ff] px-2.5 py-1">{lotLabel}</span> : null}
                            {categoryLabel ? (
                              <span className="rounded-full border border-sky-200 bg-[#dcecff] px-2.5 py-1 font-semibold">{categoryLabel}</span>
                            ) : null}
                          </div>
                        </div>

                        <div className="border-t border-sky-200/80 pt-2.5">
                          <p className="min-h-[34px] text-[1.45rem] font-extrabold tracking-tight text-[#0b5f8d]">
                            {priceLabel ?? " "}
                          </p>
                        </div>

                        {row.remateId ? (
                          <Link
                            href={`/subastas/${row.remateId}`}
                            className="inline-flex h-9 w-full items-center justify-center rounded-lg bg-[#66cceb] px-3 py-2 text-xs font-bold text-[#0f1f2c] transition hover:brightness-105"
                          >
                            Ir a ofertar
                          </Link>
                        ) : (
                          <div className="h-9 w-full" />
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

