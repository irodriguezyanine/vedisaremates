"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { InventarioRow } from "@/lib/portal-types";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/public-env";

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

  const visibleRows = useMemo(() => rows.slice(0, MAX_RENDER), [rows]);
  const hasAnyFilter =
    Boolean(q.trim()) ||
    Boolean(marca.trim()) ||
    Boolean(categoria.trim()) ||
    Boolean(yearFrom.trim()) ||
    Boolean(yearTo.trim()) ||
    operativo !== "todos" ||
    motorArranca !== "todos";

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
    if (!hasAnyFilter) {
      setRows([]);
      setSearched(false);
      setErr(null);
      setLoading(false);
      return;
    }
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
          {searched && !loading ? (
            <p className="mt-3 text-xs text-slate-400">
              Resultados: {rows.length} {rows.length === 1 ? "vehículo" : "vehículos"}.
              {rows.length > MAX_RENDER ? ` Mostrando los primeros ${MAX_RENDER}.` : ""}
            </p>
          ) : null}

          {visibleRows.length ? (
            <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {visibleRows.map((row) => (
                <article key={String(row.inventario.id)} className="rounded-lg border border-[#2a3a53] bg-[#0a1523] p-3">
                  <p className="text-sm font-bold text-white">{String(row.inventario.patente ?? "Sin patente")}</p>
                  <p className="mt-1 text-sm text-slate-200">
                    {[row.inventario.marca, row.inventario.modelo].filter(Boolean).join(" ") || "Sin marca/modelo"}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    Año: {String(row.inventario.ano ?? "—")} · Categoría: {String(row.inventario.categoria ?? "—")}
                  </p>
                  {row.remateId ? (
                    <Link
                      href={`/subastas/${row.remateId}`}
                      className="mt-2 inline-flex rounded-md bg-[#33C7E3] px-3 py-1.5 text-xs font-bold text-[#0f1f2c] hover:brightness-105"
                    >
                      Ir a ofertar
                    </Link>
                  ) : null}
                </article>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

