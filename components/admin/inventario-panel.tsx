"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { formatClp } from "@/lib/format-clp";
import type { InventarioRow } from "@/lib/portal-types";
import { SupabaseDeployWarning } from "@/components/supabase-deploy-warning";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/public-env";

type Row = InventarioRow & Record<string, unknown>;

const PAGE_SIZE = 1000;

async function fetchAllInventarioRows(supabase: NonNullable<ReturnType<typeof createClient>>): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("inventario")
      .select("*")
      .order("created_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const chunk = ((data ?? []) as Row[]) ?? [];
    out.push(...chunk);
    if (chunk.length < PAGE_SIZE) break;
  }
  return out;
}

export function InventarioPanel() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [estadoFiltro, setEstadoFiltro] = useState<string>("");
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    setLoading(true);
    const supabase = createClient();
    if (!supabase) {
      setErr("Variables NEXT_PUBLIC_SUPABASE_* no disponibles en el entorno del build.");
      setRows([]);
      setLoading(false);
      return;
    }
    try {
      const all = await fetchAllInventarioRows(supabase);
      setRows(all);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error al cargar inventario.");
      setRows([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const estadosUnicos = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) {
      const e = String(r.estado ?? "").trim();
      if (e) s.add(e);
    }
    return [...s].sort((a, b) => a.localeCompare(b, "es"));
  }, [rows]);

  const q = query.trim().toLowerCase();
  const filtered = rows.filter((r) => {
    const est = String(r.estado ?? "").trim();
    if (estadoFiltro && est !== estadoFiltro) return false;

    if (!q) return true;
    const pat = String(r.patente ?? "").toLowerCase();
    const marca = String(r.marca ?? "").toLowerCase();
    const modelo = String(r.modelo ?? "").toLowerCase();
    const empresa = String(r.empresa ?? "").toLowerCase();
    return (
      pat.includes(q) ||
      marca.includes(q) ||
      modelo.includes(q) ||
      empresa.includes(q) ||
      est.toLowerCase().includes(q)
    );
  });

  const missingDeploy = !isSupabaseConfigured();

  if (missingDeploy) {
    return (
      <div className="max-w-xl space-y-6 py-4">
        <SupabaseDeployWarning compact />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Inventario</h1>
          <p className="mt-1 text-sm text-neutral-400">
            Vista de <code className="rounded bg-white/10 px-1 text-neutral-300">public.inventario</code> con{" "}
            <strong className="text-neutral-200">todos los estados</strong> visibles para administración. Si solo ve un
            estado, ejecute en Supabase la migración{" "}
            <code className="rounded bg-white/10 px-1 text-xs text-neutral-300">
              supabase/migrations/portal_inventario_admin_select_all.sql
            </code>
            .
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-neutral-400">
            {loading ? "Cargando…" : `${filtered.length} de ${rows.length} registros`}
          </span>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="shrink-0 rounded-lg border border-white/20 px-4 py-2 text-sm font-semibold text-white hover:bg-white/5 disabled:opacity-50"
          >
            Actualizar
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por patente, marca, modelo, empresa o estado…"
          className="w-full flex-1 rounded-lg border border-white/15 bg-[#141c28] px-4 py-2 text-white placeholder:text-neutral-500"
        />
        <label className="flex shrink-0 items-center gap-2 text-sm text-neutral-400">
          <span className="whitespace-nowrap">Estado</span>
          <select
            value={estadoFiltro}
            onChange={(e) => setEstadoFiltro(e.target.value)}
            className="min-w-[12rem] rounded-lg border border-white/15 bg-[#141c28] px-3 py-2 text-white"
          >
            <option value="">Todos</option>
            {estadosUnicos.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
        </label>
      </div>

      {err ? <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">{err}</p> : null}

      <div className="overflow-hidden rounded-xl border border-white/10 bg-[#141c28]">
        <table className="w-full border-collapse text-left text-xs sm:text-sm">
          <thead className="sticky top-0 z-10 bg-[#141c28] text-neutral-500">
            <tr>
              <th className="px-3 py-2 font-medium">Patente</th>
              <th className="px-3 py-2 font-medium hidden sm:table-cell">Empresa</th>
              <th className="px-3 py-2 font-medium">Estado</th>
              <th className="px-3 py-2 font-medium">Vehículo</th>
              <th className="px-3 py-2 font-medium hidden md:table-cell">Categoría</th>
              <th className="px-3 py-2 font-medium">Valor ref.</th>
              <th className="hidden px-3 py-2 font-medium lg:table-cell">UUID</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} className="border-t border-white/10 text-neutral-200">
                <td className="min-w-[5rem] px-3 py-2 font-semibold">{String(r.patente ?? "—")}</td>
                <td className="hidden max-w-[8rem] truncate px-3 py-2 text-neutral-400 sm:table-cell" title={String(r.empresa ?? "")}>
                  {String(r.empresa ?? "").trim() || "—"}
                </td>
                <td className="max-w-[10rem] px-3 py-2 text-xs text-[#33C7E3] sm:max-w-[14rem]" title={String(r.estado ?? "")}>
                  {String(r.estado ?? "—").trim() || "—"}
                </td>
                <td className="max-w-[200px] truncate px-3 py-2" title={`${String(r.marca ?? "")} ${String(r.modelo ?? "")}`}>
                  {[r.marca, r.modelo].filter(Boolean).join(" ") || "(sin marca/modelo)"}{" "}
                  {String(r.ano ?? "").trim() ? <span className="text-neutral-500"> ({String(r.ano)}) </span> : null}
                </td>
                <td className="hidden px-3 py-2 text-neutral-400 md:table-cell">{String(r.categoria ?? "—")}</td>
                <td className="whitespace-nowrap px-3 py-2 text-[#FFC600]">{formatClp(r.valor_minimo as number | null)}</td>
                <td className="hidden max-w-[100px] truncate px-3 py-2 font-mono text-[10px] text-neutral-500 lg:table-cell" title={r.id}>
                  {r.id}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && !filtered.length ? (
          <p className="p-8 text-center text-neutral-500">
            Sin resultados con los filtros actuales. Si la tabla no carga datos, revise políticas RLS de{" "}
            <code className="text-neutral-400">public.inventario</code> para el rol admin.
          </p>
        ) : null}
      </div>
    </div>
  );
}
