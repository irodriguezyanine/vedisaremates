"use client";

import { useMemo, useState } from "react";

import type { InventarioRow } from "@/lib/portal-types";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/public-env";

type InventarioAnyRow = InventarioRow & Record<string, unknown>;
type BoolFilter = "todos" | "si" | "no";

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

const MAX_FETCH = 800;
const MAX_RENDER = 12;

export function HeroInventorySearch() {
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
  const [rows, setRows] = useState<InventarioAnyRow[]>([]);
  const [searched, setSearched] = useState(false);

  const visibleRows = useMemo(() => rows.slice(0, MAX_RENDER), [rows]);

  async function searchInventory() {
    setErr(null);
    setSearched(true);

    const hasAnyFilter =
      q.trim() ||
      marca.trim() ||
      categoria.trim() ||
      yearFrom.trim() ||
      yearTo.trim() ||
      operativo !== "todos" ||
      motorArranca !== "todos";
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
      let query = sb.from("inventario").select("*").order("created_at", { ascending: false }).limit(MAX_FETCH);
      const searchToken = normalizeSearchToken(q);
      if (searchToken.length >= 2) {
        const ilike = `%${searchToken}%`;
        // Filtro de servidor por columnas comunes; luego refinamos en cliente con "cualquier campo".
        query = query.or(
          [
            `patente.ilike.${ilike}`,
            `marca.ilike.${ilike}`,
            `modelo.ilike.${ilike}`,
            `descripcion.ilike.${ilike}`,
            `categoria.ilike.${ilike}`,
            `estado.ilike.${ilike}`,
          ].join(","),
        );
      }

      const { data, error } = await query;
      if (error) {
        setErr("No se pudo consultar inventario. Intenta nuevamente.");
        setRows([]);
        return;
      }
      let result = ((data ?? []) as InventarioAnyRow[]) ?? [];

      if (searchToken) result = result.filter((row) => rowMatchesText(row, searchToken));
      if (marca.trim()) result = result.filter((row) => normalize(row.marca).includes(normalize(marca)));
      if (categoria.trim()) result = result.filter((row) => normalize(row.categoria).includes(normalize(categoria)));
      if (yearFrom.trim()) {
        const minYear = Number(yearFrom);
        if (Number.isFinite(minYear)) {
          result = result.filter((row) => Number(row.ano ?? 0) >= minYear);
        }
      }
      if (yearTo.trim()) {
        const maxYear = Number(yearTo);
        if (Number.isFinite(maxYear)) {
          result = result.filter((row) => Number(row.ano ?? 0) <= maxYear);
        }
      }

      result = result.filter((row) =>
        rowMatchesBoolFilter(row, ["operativo", "es_operativo", "estado_operativo", "funciona"], operativo),
      );
      result = result.filter((row) =>
        rowMatchesBoolFilter(row, ["motor_arranca", "arranca", "motor_funciona"], motorArranca),
      );

      setRows(result);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="w-full border-b border-white/10 bg-[#0b1624]">
      <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-[#2a3a53] bg-gradient-to-b from-[#132235] to-[#101d2e] p-3 shadow-[0_20px_40px_-24px_rgba(0,0,0,0.8)]">
          <div className="flex flex-col gap-3 lg:flex-row">
            <div className="flex-1">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void searchInventory();
                }}
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
              <button
                type="button"
                onClick={() => void searchInventory()}
                disabled={loading}
                className="inline-flex h-12 items-center rounded-xl bg-[#33C7E3] px-5 text-sm font-bold text-[#0f1f2c] hover:brightness-105 disabled:opacity-60"
              >
                {loading ? "Buscando..." : "Buscar"}
              </button>
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
                <article key={String(row.id)} className="rounded-lg border border-[#2a3a53] bg-[#0a1523] p-3">
                  <p className="text-sm font-bold text-white">{String(row.patente ?? "Sin patente")}</p>
                  <p className="mt-1 text-sm text-slate-200">{[row.marca, row.modelo].filter(Boolean).join(" ") || "Sin marca/modelo"}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    Año: {String(row.ano ?? "—")} · Categoría: {String(row.categoria ?? "—")}
                  </p>
                </article>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

