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
};

export function OfertasPanel() {
  const [rows, setRows] = useState<OfertaFeedRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [filterRemate, setFilterRemate] = useState("");
  const [filterLote, setFilterLote] = useState("");
  const [filterCliente, setFilterCliente] = useState("");
  const [filterUsuario, setFilterUsuario] = useState("");
  const [filterEmail, setFilterEmail] = useState("");
  const [filterTipo, setFilterTipo] = useState<"all" | "auto" | "manual">("all");
  const [filterAlerta, setFilterAlerta] = useState<"all" | "si" | "no">("all");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
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
    if (!kpiError && kpiData) {
      setKpis(kpiData as typeof kpis);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
    const id = window.setInterval(() => void load(), 12000);
    return () => window.clearInterval(id);
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const remateQ = filterRemate.trim().toLowerCase();
    const loteQ = filterLote.trim().toLowerCase();
    const clienteQ = filterCliente.trim().toLowerCase();
    const usuarioQ = filterUsuario.trim().toLowerCase();
    const emailQ = filterEmail.trim().toLowerCase();
    const desdeTs = desde ? new Date(`${desde}T00:00:00`).getTime() : null;
    const hastaTs = hasta ? new Date(`${hasta}T23:59:59`).getTime() : null;

    return rows.filter((r) => {
      const allText = [r.remate_titulo, r.lote_titulo, r.cliente_nombre, r.cliente_usuario, r.cliente_email, r.motivo_sospecha ?? ""]
        .join(" | ")
        .toLowerCase();
      if (q && !allText.includes(q)) return false;
      if (remateQ && !r.remate_titulo.toLowerCase().includes(remateQ)) return false;
      if (loteQ && !r.lote_titulo.toLowerCase().includes(loteQ)) return false;
      if (clienteQ && !r.cliente_nombre.toLowerCase().includes(clienteQ)) return false;
      if (usuarioQ && !r.cliente_usuario.toLowerCase().includes(usuarioQ)) return false;
      if (emailQ && !r.cliente_email.toLowerCase().includes(emailQ)) return false;
      if (filterTipo === "auto" && !r.es_auto) return false;
      if (filterTipo === "manual" && r.es_auto) return false;
      if (filterAlerta === "si" && !r.sospechosa) return false;
      if (filterAlerta === "no" && r.sospechosa) return false;
      const t = new Date(r.fecha).getTime();
      if (desdeTs != null && t < desdeTs) return false;
      if (hastaTs != null && t > hastaTs) return false;
      return true;
    });
  }, [
    rows,
    search,
    filterRemate,
    filterLote,
    filterCliente,
    filterUsuario,
    filterEmail,
    filterTipo,
    filterAlerta,
    desde,
    hasta,
  ]);

  function exportCsv() {
    const lines = [
      "Fecha;Remate;Lote;Cliente;Usuario;Email;Monto;Auto;Sospechosa;Motivo",
      ...filtered.map((r) =>
        [
          new Date(r.fecha).toLocaleString("es-CL"),
          r.remate_titulo,
          r.lote_titulo,
          r.cliente_nombre,
          r.cliente_usuario,
          r.cliente_email,
          String(r.monto),
          r.es_auto ? "si" : "no",
          r.sospechosa ? "si" : "no",
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
    a.download = `acta-ofertas-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportPdf() {
    const htmlRows = filtered
      .map(
        (r) => `<tr>
<td>${new Date(r.fecha).toLocaleString("es-CL")}</td>
<td>${r.remate_titulo}</td>
<td>${r.lote_titulo}</td>
<td>${r.cliente_nombre}</td>
<td>${r.cliente_usuario}</td>
<td>${r.cliente_email}</td>
<td>${formatClp(r.monto)}</td>
<td>${r.es_auto ? "Auto" : "Manual"}</td>
<td>${r.sospechosa ? r.motivo_sospecha ?? "Revisar" : "-"}</td>
</tr>`,
      )
      .join("");
    const win = window.open("", "_blank", "width=1200,height=800");
    if (!win) return;
    win.document.write(`
      <html><head><title>Acta de subasta</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 18px; }
        h1 { font-size: 20px; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        th, td { border: 1px solid #ccc; padding: 6px; text-align: left; }
        th { background: #f3f3f3; }
      </style>
      </head><body>
      <h1>Acta oficial de ofertas</h1>
      <p>Fecha de emisión: ${new Date().toLocaleString("es-CL")}</p>
      <table>
        <thead><tr><th>Fecha</th><th>Remate</th><th>Lote</th><th>Cliente</th><th>Usuario</th><th>Email</th><th>Oferta</th><th>Tipo</th><th>Alerta</th></tr></thead>
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
          <h1 className="text-xl font-bold text-white">Ofertas en vivo</h1>
          <p className="text-sm text-neutral-400">Feed global administrativo, alertas y exportación de acta (CSV).</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => void load()} className="rounded border border-white/20 px-3 py-2 text-sm text-neutral-200 hover:bg-white/5">
            Actualizar
          </button>
          <button type="button" onClick={exportCsv} className="rounded bg-[#33C7E3] px-3 py-2 text-sm font-bold text-[#0f1f2c]">
            Exportar acta CSV
          </button>
          <button type="button" onClick={exportPdf} className="rounded border border-white/20 px-3 py-2 text-sm text-neutral-100 hover:bg-white/5">
            Exportar acta PDF
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

      <label className="block text-sm">
        <span className="text-neutral-400">Buscar</span>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mt-1 w-full rounded border border-white/15 bg-black/30 px-3 py-2 text-white"
          placeholder="Remate, lote, cliente, usuario o email…"
        />
      </label>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <input value={filterRemate} onChange={(e) => setFilterRemate(e.target.value)} className="rounded border border-white/15 bg-black/30 px-3 py-2 text-sm text-white" placeholder="Filtrar Remate" />
        <input value={filterLote} onChange={(e) => setFilterLote(e.target.value)} className="rounded border border-white/15 bg-black/30 px-3 py-2 text-sm text-white" placeholder="Filtrar Lote" />
        <input value={filterCliente} onChange={(e) => setFilterCliente(e.target.value)} className="rounded border border-white/15 bg-black/30 px-3 py-2 text-sm text-white" placeholder="Filtrar Cliente" />
        <input value={filterUsuario} onChange={(e) => setFilterUsuario(e.target.value)} className="rounded border border-white/15 bg-black/30 px-3 py-2 text-sm text-white" placeholder="Filtrar Usuario" />
        <input value={filterEmail} onChange={(e) => setFilterEmail(e.target.value)} className="rounded border border-white/15 bg-black/30 px-3 py-2 text-sm text-white" placeholder="Filtrar Email" />
        <select value={filterTipo} onChange={(e) => setFilterTipo(e.target.value as typeof filterTipo)} className="rounded border border-white/15 bg-black/30 px-3 py-2 text-sm text-white">
          <option value="all">Tipo: todos</option>
          <option value="manual">Tipo: manual</option>
          <option value="auto">Tipo: auto</option>
        </select>
        <select value={filterAlerta} onChange={(e) => setFilterAlerta(e.target.value as typeof filterAlerta)} className="rounded border border-white/15 bg-black/30 px-3 py-2 text-sm text-white">
          <option value="all">Alerta: todas</option>
          <option value="si">Solo sospechosas</option>
          <option value="no">Solo no sospechosas</option>
        </select>
        <div className="flex gap-2">
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="w-full rounded border border-white/15 bg-black/30 px-3 py-2 text-sm text-white" />
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="w-full rounded border border-white/15 bg-black/30 px-3 py-2 text-sm text-white" />
        </div>
      </div>
      <p className="text-xs text-neutral-500">Resultados filtrados: {filtered.length}</p>

      <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#141c28]">
        <table className="min-w-[1100px] w-full border-collapse text-left text-sm">
          <thead className="bg-black/20 text-neutral-400">
            <tr>
              <th className="px-3 py-2 font-semibold">Fecha</th>
              <th className="px-3 py-2 font-semibold">Remate / Lote</th>
              <th className="px-3 py-2 font-semibold">Cliente</th>
              <th className="px-3 py-2 font-semibold">Usuario</th>
              <th className="px-3 py-2 font-semibold">Email</th>
              <th className="px-3 py-2 font-semibold">Oferta</th>
              <th className="px-3 py-2 font-semibold">Tipo</th>
              <th className="px-3 py-2 font-semibold">Alerta</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.oferta_id} className={`border-t border-white/10 ${r.sospechosa ? "bg-amber-900/20" : "text-neutral-200"}`}>
                <td className="px-3 py-2">{new Date(r.fecha).toLocaleString("es-CL")}</td>
                <td className="px-3 py-2">
                  <p className="font-semibold">{r.remate_titulo}</p>
                  <p className="text-xs text-neutral-400">{r.lote_titulo}</p>
                </td>
                <td className="px-3 py-2">{r.cliente_nombre}</td>
                <td className="px-3 py-2 font-mono text-xs">{r.cliente_usuario}</td>
                <td className="px-3 py-2">{r.cliente_email}</td>
                <td className="px-3 py-2 font-bold text-[#FFC600]">{formatClp(r.monto)}</td>
                <td className="px-3 py-2">{r.es_auto ? "Auto" : "Manual"}</td>
                <td className="px-3 py-2">{r.sospechosa ? (r.motivo_sospecha ?? "Revisar") : "—"}</td>
              </tr>
            ))}
            {!filtered.length ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-neutral-500">
                  {loading ? "Cargando…" : "Sin ofertas para mostrar."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
