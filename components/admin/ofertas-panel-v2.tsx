"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { formatClp } from "@/lib/format-clp";
import { createClient } from "@/lib/supabase/client";

type OfertaFeedRow = {
  oferta_id: string;
  fecha: string;
  remate_id: string;
  remate_titulo: string;
  lote_id: string;
  lote_titulo: string;
  monto: number;
  cliente_nombre: string;
  cliente_usuario: string;
  cliente_email: string;
  es_auto: boolean;
  sospechosa: boolean;
  motivo_sospecha: string | null;
  es_ganadora: boolean;
};

type LoteGroup = {
  loteId: string;
  loteTitulo: string;
  rows: OfertaFeedRow[];
  latestAt: number;
  totalMonto: number;
  uniqueUsers: number;
  winner: OfertaFeedRow | null;
};

type RemateGroup = {
  remateId: string;
  remateTitulo: string;
  categoria: "Venta directa" | "Subasta";
  rows: OfertaFeedRow[];
  lots: LoteGroup[];
  latestAt: number;
  totalMonto: number;
};

function normalizeText(value: string): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function toTimestamp(value: string): number {
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : 0;
}

function inferCategoria(remateTitulo: string): "Venta directa" | "Subasta" {
  const title = normalizeText(remateTitulo);
  return title.includes("venta directa") || title.includes("catalogo") ? "Venta directa" : "Subasta";
}

function buildSearchText(row: OfertaFeedRow): string {
  return normalizeText(
    [
      row.remate_titulo,
      row.lote_titulo,
      row.cliente_nombre,
      row.cliente_usuario,
      row.cliente_email,
      formatClp(row.monto),
      row.es_auto ? "auto automatica" : "manual",
      row.sospechosa ? `alerta ${row.motivo_sospecha ?? ""}` : "",
      row.es_ganadora ? "ganadora ganador" : "",
      new Date(row.fecha).toLocaleString("es-CL"),
    ].join(" | "),
  );
}

function winnerFromRows(rows: OfertaFeedRow[]): OfertaFeedRow | null {
  const explicit = rows.find((r) => r.es_ganadora);
  if (explicit) return explicit;
  if (!rows.length) return null;
  return [...rows].sort((a, b) => b.monto - a.monto || toTimestamp(b.fecha) - toTimestamp(a.fecha))[0] ?? null;
}

export function OfertasPanelV2() {
  const [rows, setRows] = useState<OfertaFeedRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [expandedRemates, setExpandedRemates] = useState<Record<string, boolean>>({});
  const [expandedLotes, setExpandedLotes] = useState<Record<string, boolean>>({});
  const [kpis, setKpis] = useState<{
    remates_activos: number;
    lotes_activos: number;
    ofertas_24h: number;
    monto_24h: number;
    usuarios_con_garantia: number;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    const sb = createClient();
    if (!sb) {
      setErr("Servicio no disponible.");
      setLoading(false);
      return;
    }

    const [{ data, error }, { data: kpiData, error: kpiError }] = await Promise.all([
      sb.rpc("portal_admin_feed_ofertas_global", { p_limit: 1500 }),
      sb.rpc("portal_admin_kpis_remates"),
    ]);
    setLoading(false);

    if (error) {
      setErr(error.message);
      setRows([]);
    } else {
      setRows(((data ?? []) as OfertaFeedRow[]) ?? []);
    }
    if (!kpiError && kpiData) setKpis(kpiData as typeof kpis);
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
    const id = window.setInterval(() => void load(), 12000);
    return () => window.clearInterval(id);
  }, [load]);

  const filteredRows = useMemo(() => {
    const q = normalizeText(search);
    if (!q) return rows;
    return rows.filter((r) => buildSearchText(r).includes(q));
  }, [rows, search]);

  const grouped = useMemo<RemateGroup[]>(() => {
    const remateMap = new Map<string, OfertaFeedRow[]>();
    for (const row of filteredRows) {
      const key = `${row.remate_id}::${row.remate_titulo}`;
      const list = remateMap.get(key) ?? [];
      list.push(row);
      remateMap.set(key, list);
    }

    const groups: RemateGroup[] = [];
    for (const [key, remateRows] of remateMap.entries()) {
      const [remateId, remateTitulo] = key.split("::");
      const lotMap = new Map<string, OfertaFeedRow[]>();
      for (const row of remateRows) {
        const lotKey = `${row.lote_id}::${row.lote_titulo}`;
        const list = lotMap.get(lotKey) ?? [];
        list.push(row);
        lotMap.set(lotKey, list);
      }

      const lots: LoteGroup[] = [...lotMap.entries()].map(([lotKey, lotRows]) => {
        const [loteId, loteTitulo] = lotKey.split("::");
        const sortedRows = [...lotRows].sort((a, b) => toTimestamp(b.fecha) - toTimestamp(a.fecha));
        return {
          loteId,
          loteTitulo,
          rows: sortedRows,
          latestAt: toTimestamp(sortedRows[0]?.fecha ?? ""),
          totalMonto: sortedRows.reduce((sum, row) => sum + Number(row.monto || 0), 0),
          uniqueUsers: new Set(sortedRows.map((r) => r.cliente_usuario || r.cliente_email || r.cliente_nombre)).size,
          winner: winnerFromRows(sortedRows),
        };
      });

      lots.sort((a, b) => b.latestAt - a.latestAt || b.rows.length - a.rows.length);
      groups.push({
        remateId,
        remateTitulo,
        categoria: inferCategoria(remateTitulo),
        rows: remateRows,
        lots,
        latestAt: Math.max(...remateRows.map((r) => toTimestamp(r.fecha))),
        totalMonto: remateRows.reduce((sum, row) => sum + Number(row.monto || 0), 0),
      });
    }

    groups.sort((a, b) => {
      if (a.categoria !== b.categoria) return a.categoria.localeCompare(b.categoria);
      return b.latestAt - a.latestAt || a.remateTitulo.localeCompare(b.remateTitulo);
    });
    return groups;
  }, [filteredRows]);

  const totals = useMemo(() => {
    const remates = grouped.length;
    const lotes = grouped.reduce((sum, g) => sum + g.lots.length, 0);
    const ofertas = filteredRows.length;
    const usuarios = new Set(filteredRows.map((r) => r.cliente_usuario || r.cliente_email || r.cliente_nombre)).size;
    const monto = filteredRows.reduce((sum, r) => sum + Number(r.monto || 0), 0);
    const latest = filteredRows.length ? new Date(filteredRows[0]!.fecha).toLocaleString("es-CL") : "—";
    return { remates, lotes, ofertas, usuarios, monto, latest };
  }, [filteredRows, grouped]);

  function toggleRemate(remateId: string) {
    setExpandedRemates((prev) => ({ ...prev, [remateId]: !prev[remateId] }));
  }

  function toggleLote(remateId: string, loteId: string) {
    const key = `${remateId}:${loteId}`;
    setExpandedLotes((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function exportCsv() {
    const lines = [
      "Fecha;Categoría;Remate;Lote;Cliente;Usuario;Email;Monto;Tipo;Alerta;Ganadora;Motivo",
      ...filteredRows.map((r) =>
        [
          new Date(r.fecha).toLocaleString("es-CL"),
          inferCategoria(r.remate_titulo),
          r.remate_titulo,
          r.lote_titulo,
          r.cliente_nombre,
          r.cliente_usuario,
          r.cliente_email,
          String(r.monto),
          r.es_auto ? "Auto" : "Manual",
          r.sospechosa ? "Sí" : "No",
          r.es_ganadora ? "Sí" : "No",
          r.motivo_sospecha ?? "",
        ]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(";"),
      ),
    ];
    const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `monitor-ofertas-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportPdf() {
    const htmlRows = filteredRows
      .map(
        (r) => `<tr>
          <td>${new Date(r.fecha).toLocaleString("es-CL")}</td>
          <td>${inferCategoria(r.remate_titulo)}</td>
          <td>${r.remate_titulo}</td>
          <td>${r.lote_titulo}</td>
          <td>${r.cliente_nombre}</td>
          <td>${r.cliente_usuario}</td>
          <td>${r.cliente_email}</td>
          <td>${formatClp(r.monto)}</td>
          <td>${r.es_auto ? "Auto" : "Manual"}</td>
          <td>${r.es_ganadora ? "Sí" : "—"}</td>
        </tr>`,
      )
      .join("");
    const win = window.open("", "_blank", "width=1280,height=900");
    if (!win) return;
    win.document.write(`
      <html><head><title>Monitor de ofertas</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 18px; }
        h1 { font-size: 20px; margin: 0 0 6px; }
        p { margin: 0 0 12px; color: #334155; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        th, td { border: 1px solid #cbd5e1; padding: 6px; text-align: left; }
        th { background: #f1f5f9; }
      </style>
      </head><body>
      <h1>Monitor de ofertas</h1>
      <p>Emitido: ${new Date().toLocaleString("es-CL")}</p>
      <table>
        <thead><tr><th>Fecha</th><th>Categoría</th><th>Remate</th><th>Lote</th><th>Cliente</th><th>Usuario</th><th>Email</th><th>Monto</th><th>Tipo</th><th>Ganadora</th></tr></thead>
        <tbody>${htmlRows}</tbody>
      </table>
      </body></html>
    `);
    win.document.close();
    win.focus();
    win.print();
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Monitor inteligente de ofertas</h1>
          <p className="text-sm text-neutral-400">
            Vista jerárquica por categoría, remate, lote, usuario y fecha. Secciones colapsables para revisión rápida.
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => void load()} className="rounded border border-white/20 px-3 py-2 text-sm text-neutral-200 hover:bg-white/5">
            Actualizar
          </button>
          <button type="button" onClick={exportCsv} className="rounded bg-[#33C7E3] px-3 py-2 text-sm font-bold text-[#0f1f2c]">
            Exportar CSV
          </button>
          <button type="button" onClick={exportPdf} className="rounded border border-white/20 px-3 py-2 text-sm text-neutral-100 hover:bg-white/5">
            Exportar PDF
          </button>
        </div>
      </div>

      {kpis ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-lg border border-white/10 bg-[#141c28] p-3 text-sm"><p className="text-neutral-400">Remates activos</p><p className="text-lg font-bold text-white">{kpis.remates_activos}</p></div>
          <div className="rounded-lg border border-white/10 bg-[#141c28] p-3 text-sm"><p className="text-neutral-400">Lotes activos</p><p className="text-lg font-bold text-white">{kpis.lotes_activos}</p></div>
          <div className="rounded-lg border border-white/10 bg-[#141c28] p-3 text-sm"><p className="text-neutral-400">Ofertas 24h</p><p className="text-lg font-bold text-white">{kpis.ofertas_24h}</p></div>
          <div className="rounded-lg border border-white/10 bg-[#141c28] p-3 text-sm"><p className="text-neutral-400">Monto 24h</p><p className="text-lg font-bold text-white">{formatClp(kpis.monto_24h)}</p></div>
          <div className="rounded-lg border border-white/10 bg-[#141c28] p-3 text-sm"><p className="text-neutral-400">Clientes con garantía</p><p className="text-lg font-bold text-white">{kpis.usuarios_con_garantia}</p></div>
        </div>
      ) : null}

      {err ? <p className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">{err}</p> : null}

      <div className="rounded-xl border border-white/10 bg-[#141c28] p-4">
        <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-neutral-400">Buscar en cualquier columna</label>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2.5 text-sm text-white outline-none ring-[#33C7E3]/50 placeholder:text-neutral-500 focus:ring-2"
          placeholder="Ej: haraselpalenque, ignacio, $22.800.000, silverado, manual, ganadora..."
        />
        <div className="mt-3 grid gap-2 text-xs text-neutral-400 sm:grid-cols-2 xl:grid-cols-6">
          <p>Resultados: <strong className="text-neutral-200">{totals.ofertas}</strong></p>
          <p>Categorías/remates: <strong className="text-neutral-200">{totals.remates}</strong></p>
          <p>Lotes: <strong className="text-neutral-200">{totals.lotes}</strong></p>
          <p>Usuarios: <strong className="text-neutral-200">{totals.usuarios}</strong></p>
          <p>Monto total: <strong className="text-neutral-200">{formatClp(totals.monto)}</strong></p>
          <p>Última actividad: <strong className="text-neutral-200">{totals.latest}</strong></p>
        </div>
      </div>

      <div className="space-y-3">
        {grouped.map((group) => {
          const remateOpen = Boolean(expandedRemates[group.remateId]);
          return (
            <section key={group.remateId} className="overflow-hidden rounded-xl border border-white/10 bg-[#141c28]">
              <button
                type="button"
                onClick={() => toggleRemate(group.remateId)}
                className="w-full px-4 py-3 text-left transition hover:bg-white/5"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                        group.categoria === "Venta directa" ? "bg-cyan-500/20 text-cyan-200" : "bg-sky-500/20 text-sky-200"
                      }`}>
                        {group.categoria}
                      </span>
                      <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-neutral-200">
                        {group.lots.length} lotes
                      </span>
                      <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-neutral-200">
                        {group.rows.length} ofertas
                      </span>
                    </div>
                    <h2 className="mt-1 truncate text-base font-bold text-white">{group.remateTitulo}</h2>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-neutral-300">
                    <p className="font-semibold text-[#FFC600]">{formatClp(group.totalMonto)}</p>
                    <p>{new Date(group.latestAt).toLocaleString("es-CL")}</p>
                    <span className="text-lg">{remateOpen ? "▾" : "▸"}</span>
                  </div>
                </div>
              </button>

              {remateOpen ? (
                <div className="space-y-2 border-t border-white/10 bg-black/10 p-3">
                  {group.lots.map((lot) => {
                    const lotKey = `${group.remateId}:${lot.loteId}`;
                    const lotOpen = Boolean(expandedLotes[lotKey]);
                    return (
                      <article key={lotKey} className="rounded-lg border border-white/10 bg-[#0f1724]">
                        <button
                          type="button"
                          onClick={() => toggleLote(group.remateId, lot.loteId)}
                          className="w-full px-3 py-2.5 text-left hover:bg-white/5"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-bold text-neutral-100">{lot.loteTitulo}</p>
                              <p className="mt-0.5 text-xs text-neutral-400">
                                {lot.rows.length} ofertas · {lot.uniqueUsers} usuarios · Última: {new Date(lot.latestAt).toLocaleString("es-CL")}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              {lot.winner ? (
                                <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-bold text-emerald-300">
                                  Ganadora: {formatClp(lot.winner.monto)}
                                </span>
                              ) : null}
                              <span className="text-base text-neutral-300">{lotOpen ? "▾" : "▸"}</span>
                            </div>
                          </div>
                        </button>

                        {lotOpen ? (
                          <div className="overflow-x-auto border-t border-white/10">
                            <table className="min-w-[980px] w-full border-collapse text-left text-sm">
                              <thead className="bg-white/5 text-neutral-400">
                                <tr>
                                  <th className="px-3 py-2 font-semibold">Fecha</th>
                                  <th className="px-3 py-2 font-semibold">Usuario</th>
                                  <th className="px-3 py-2 font-semibold">Cliente</th>
                                  <th className="px-3 py-2 font-semibold">Email</th>
                                  <th className="px-3 py-2 font-semibold">Oferta</th>
                                  <th className="px-3 py-2 font-semibold">Tipo</th>
                                  <th className="px-3 py-2 font-semibold">Alerta</th>
                                  <th className="px-3 py-2 font-semibold">Estado</th>
                                </tr>
                              </thead>
                              <tbody>
                                {lot.rows.map((r) => (
                                  <tr
                                    key={r.oferta_id}
                                    className={`border-t border-white/10 ${
                                      r.es_ganadora ? "bg-emerald-900/25 text-neutral-100" : r.sospechosa ? "bg-amber-900/20 text-neutral-100" : "text-neutral-200"
                                    }`}
                                  >
                                    <td className="px-3 py-2">{new Date(r.fecha).toLocaleString("es-CL")}</td>
                                    <td className="px-3 py-2 font-mono text-xs">{r.cliente_usuario || "—"}</td>
                                    <td className="px-3 py-2">{r.cliente_nombre || "—"}</td>
                                    <td className="px-3 py-2">{r.cliente_email || "—"}</td>
                                    <td className="px-3 py-2 font-bold text-[#FFC600]">{formatClp(r.monto)}</td>
                                    <td className="px-3 py-2">{r.es_auto ? "Auto" : "Manual"}</td>
                                    <td className="px-3 py-2">{r.sospechosa ? (r.motivo_sospecha ?? "Revisar") : "—"}</td>
                                    <td className="px-3 py-2">
                                      {r.es_ganadora ? (
                                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700">🏆 Ganadora</span>
                                      ) : (
                                        "—"
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              ) : null}
            </section>
          );
        })}

        {!grouped.length ? (
          <div className="rounded-xl border border-white/10 bg-[#141c28] px-4 py-8 text-center text-neutral-400">
            {loading ? "Cargando monitor de ofertas…" : "Sin resultados con ese criterio de búsqueda."}
          </div>
        ) : null}
      </div>
    </div>
  );
}
