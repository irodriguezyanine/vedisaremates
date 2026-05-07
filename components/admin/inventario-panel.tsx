"use client";

import { useCallback, useEffect, useState } from "react";

import { formatClp } from "@/lib/format-clp";
import type { InventarioRow } from "@/lib/portal-types";
import { createClient } from "@/lib/supabase/client";

type Row = InventarioRow & Record<string, unknown>;

export function InventarioPanel() {
  const [rows, setRows] = useState<Row[]>([]);
  const [query, setQuery] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    const supabase = createClient();
    const lim = 300;
    const { data, error } = await supabase.from("inventario").select("*").order("created_at", { ascending: false }).limit(lim);

    if (error) {
      setErr(error.message);
      setRows([]);
      return;
    }
    setRows((data as Row[]) ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const q = query.trim().toLowerCase();
  const filtered = rows.filter((r) => {
    if (!q) return true;
    const pat = String(r.patente ?? "").toLowerCase();
    const marca = String(r.marca ?? "").toLowerCase();
    const modelo = String(r.modelo ?? "").toLowerCase();
    return pat.includes(q) || marca.includes(q) || modelo.includes(q);
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Inventario Tasaciones</h1>
          <p className="mt-1 text-sm text-neutral-400">
            Tabla{" "}
            <code className="rounded bg-white/10 px-1 text-neutral-300">public.inventario</code> sincronizada con el
            sistema interno. Últimos {Math.min(rows.length, 300)} registros cargados aquí para asignarlos como lotes.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="shrink-0 rounded-lg border border-white/20 px-4 py-2 text-sm font-semibold text-white hover:bg-white/5"
        >
          Actualizar lista
        </button>
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Filtrar por patente, marca o modelo…"
        className="w-full rounded-lg border border-white/15 bg-[#141c28] px-4 py-2 text-white placeholder:text-neutral-500"
      />

      {err ? <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">{err}</p> : null}

      <div className="overflow-hidden rounded-xl border border-white/10 bg-[#141c28]">
        <table className="w-full border-collapse text-left text-xs sm:text-sm">
          <thead className="sticky top-0 z-10 bg-[#141c28] text-neutral-500">
            <tr>
              <th className="px-3 py-2 font-medium">Patente</th>
              <th className="px-3 py-2 font-medium">Vehículo</th>
              <th className="px-3 py-2 font-medium hidden md:table-cell">Categoría</th>
              <th className="px-3 py-2 font-medium">Valor ref.</th>
              <th className="px-3 py-2 font-medium">UUID</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} className="border-t border-white/10 text-neutral-200">
                <td className="px-3 py-2 font-semibold">{r.patente ?? "—"}</td>
                <td className="max-w-[220px] truncate px-3 py-2" title={`${String(r.marca ?? "")} ${String(r.modelo ?? "")}`}>
                  {[r.marca, r.modelo].filter(Boolean).join(" ") || "(sin marca/modelo)"}
                </td>
                <td className="hidden px-3 py-2 text-neutral-400 md:table-cell">{String(r.categoria ?? "—")}</td>
                <td className="whitespace-nowrap px-3 py-2 text-[#FFC600]">{formatClp(r.valor_minimo as number)}</td>
                <td className="max-w-[100px] truncate px-3 py-2 font-mono text-[10px] text-neutral-500" title={r.id}>
                  {r.id}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!filtered.length ? (
          <p className="p-8 text-center text-neutral-500">Sin resultados. Verificá RLS si la tabla no cargó.</p>
        ) : null}
      </div>
    </div>
  );
}
