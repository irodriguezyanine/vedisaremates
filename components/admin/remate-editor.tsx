"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { formatClp } from "@/lib/format-clp";
import type { InventarioRow, PortalRemateLoteRow, PortalRemateRow } from "@/lib/portal-types";
import { firstGlo3dViewerUrl, preferredThumbnailUrl } from "@/lib/inventario-media";
import { SupabaseDeployWarning } from "@/components/supabase-deploy-warning";
import { useStyledDialogs } from "@/components/ui/use-styled-dialogs";
import { createClient } from "@/lib/supabase/client";
import { getPublicSupabaseEnv, isSupabaseConfigured } from "@/lib/supabase/public-env";

type Inv = InventarioRow & { id: string };
type OfertaAdminRow = {
  oferta_id: string;
  fecha: string;
  monto: number;
  lote_id: string;
  lote_titulo: string;
  cliente_nombre: string;
  cliente_usuario: string;
  cliente_email: string;
  es_auto?: boolean;
  sospechosa?: boolean;
  motivo_sospecha?: string | null;
  es_ganadora?: boolean;
};

const PAGE_SIZE = 20;

function escapedIlike(term: string) {
  return term.replace(/%/g, "").replace(/,/g, " ").replace(/[()]/g, "").slice(0, 42);
}

export function RemateEditor({ remateId }: { remateId: string }) {
  const { confirm, dialogElement } = useStyledDialogs();
  const [remate, setRemate] = useState<PortalRemateRow | null>(null);
  const [lotes, setLotes] = useState<PortalRemateLoteRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [ofertas, setOfertas] = useState<OfertaAdminRow[]>([]);
  const [loadingOfertas, setLoadingOfertas] = useState(false);
  const [savingLoteId, setSavingLoteId] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<Array<{ created_at: string; event_type: string; detalle: Record<string, unknown> | null }>>([]);

  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [modalPage, setModalPage] = useState(1);
  const [modalSearch, setModalSearch] = useState("");
  const [modalSearchDebounced, setModalSearchDebounced] = useState("");
  const [modalRows, setModalRows] = useState<Inv[]>([]);
  const [modalTotal, setModalTotal] = useState(0);
  const [modalLoading, setModalLoading] = useState(false);
  const [selectedInvById, setSelectedInvById] = useState<Map<string, Inv>>(() => new Map());
  const [addingBulk, setAddingBulk] = useState(false);

  const load = useCallback(async () => {
    if (!getPublicSupabaseEnv()) return;
    const sb = createClient();
    if (!sb) {
      setErr("Variables públicas del servicio no están definidas en este despliegue.");
      return;
    }
    const { data: r, error: e1 } = await sb.from("portal_remates").select("*").eq("id", remateId).single();
    if (e1) {
      setErr(e1.message);
      return;
    }
    setRemate(r as PortalRemateRow);
    const { data: l, error: e2 } = await sb
      .from("portal_remate_lotes")
      .select("*")
      .eq("remate_id", remateId)
      .order("orden", { ascending: true });
    if (e2) {
      setErr(e2.message);
      return;
    }
    setLotes((l as PortalRemateLoteRow[]) ?? []);

    setLoadingOfertas(true);
    const { data: ofertasData, error: e3 } = await sb.rpc("portal_admin_listar_ofertas_remate", {
      p_remate_id: remateId,
      p_limit: 2000,
    });
    setLoadingOfertas(false);
    if (e3) {
      setErr(e3.message);
      setOfertas([]);
      return;
    }
    setOfertas(((ofertasData ?? []) as OfertaAdminRow[]) ?? []);
    const { data: tlData } = await sb
      .from("portal_lote_eventos")
      .select("created_at, event_type, detalle")
      .eq("remate_id", remateId)
      .order("created_at", { ascending: false })
      .limit(300);
    setTimeline(((tlData ?? []) as Array<{ created_at: string; event_type: string; detalle: Record<string, unknown> | null }>) ?? []);
  }, [remateId]);

  useEffect(() => {
    void load();
  }, [load]);

  const fetchInventoryPage = useCallback(async () => {
    if (!inventoryOpen || !getPublicSupabaseEnv()) return;
    const sb = createClient();
    if (!sb) return;

    const usedIds = lotes.map((l) => l.inventario_id).filter((x): x is string => Boolean(x));

    setModalLoading(true);
    const safe = escapedIlike(modalSearchDebounced.trim());
    const from = (modalPage - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let q = sb.from("inventario").select("*", { count: "exact" });

    if (usedIds.length > 0) {
      q = q.not("id", "in", `(${usedIds.join(",")})`);
    }

    if (safe.length >= 2) {
      const pattern = `%${safe}%`;
      q = q.or(`patente.ilike.${pattern},marca.ilike.${pattern},modelo.ilike.${pattern}`);
    }

    const { data, error, count } = await q.order("created_at", { ascending: false }).range(from, to);

    setModalLoading(false);
    if (error) {
      setErr(error.message);
      setModalRows([]);
      setModalTotal(0);
      return;
    }
    setModalRows(((data ?? []) as Inv[]) ?? []);
    setModalTotal(count ?? 0);
  }, [inventoryOpen, modalPage, modalSearchDebounced, lotes]);

  useEffect(() => {
    void fetchInventoryPage();
  }, [fetchInventoryPage]);

  useEffect(() => {
    if (inventoryOpen) {
      setSelectedInvById(new Map());
      setModalSearch("");
      setModalPage(1);
    }
  }, [inventoryOpen]);

  useEffect(() => {
    setModalPage(1);
  }, [modalSearchDebounced]);

  useEffect(() => {
    const t = window.setTimeout(() => setModalSearchDebounced(modalSearch), 350);
    return () => window.clearTimeout(t);
  }, [modalSearch]);

  const totalPages = Math.max(1, Math.ceil(modalTotal / PAGE_SIZE));

  useEffect(() => {
    if (inventoryOpen && modalPage > totalPages) setModalPage(totalPages);
  }, [inventoryOpen, modalPage, totalPages]);

  async function saveRemate(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    if (!remate) return;
    setSaving(true);
    setErr(null);
    const form = ev.currentTarget;
    const fd = new FormData(form);
    const starts = String(fd.get("starts_at") ?? "").trim();
    const ends = String(fd.get("ends_at") ?? "").trim();

    const response = await fetch("/api/admin/remates/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        remateId: remate.id,
        titulo: String(fd.get("titulo") ?? "").trim(),
        descripcion: String(fd.get("descripcion") ?? "").trim(),
        estado: fd.get("estado") as PortalRemateRow["estado"],
        startsAt: starts ? new Date(starts).toISOString() : null,
        endsAt: ends ? new Date(ends).toISOString() : remate.ends_at,
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    setSaving(false);
    if (!response.ok || !payload.ok) {
      setErr(payload.error ?? "No se pudo guardar cambios.");
      return;
    }
    void load();
  }

  async function addLotesBulk(invs: Inv[]) {
    const sb = createClient();
    if (!sb) {
      setErr("Servicio de datos no disponible.");
      return;
    }
    if (!invs.length) return;

    let nextOrden =
      lotes.length > 0 ? Math.max(...lotes.map((x) => x.orden)) + 1 : 0;

    const rows = invs.map((inv) => {
      const titulo =
        [inv.marca, inv.modelo, inv.patente].filter(Boolean).join(" · ") || inv.patente || "Lote";
      const base = Number(inv.valor_minimo ?? 0) || 0;
      const precioMinimoRemate = Number(inv.precio_minimo_remate ?? base) || base;
      const row = {
        remate_id: remateId,
        inventario_id: inv.id,
        titulo,
        orden: nextOrden,
        precio_base: base,
        precio_minimo_remate: precioMinimoRemate,
        incremento_minimo: 50000,
      };
      nextOrden += 1;
      return row;
    });

    const { error } = await sb.from("portal_remate_lotes").insert(rows);
    if (error) {
      setErr(error.message);
      return;
    }
    setSelectedInvById(new Map());
    await load();
  }

  async function removeLote(id: string) {
    const ok = await confirm({
      title: "Eliminar lote",
      message: "¿Eliminar este lote?",
      confirmText: "Eliminar",
      cancelText: "Cancelar",
      variant: "danger",
    });
    if (!ok) return;
    const sb = createClient();
    if (!sb) {
      setErr("Servicio de datos no disponible.");
      return;
    }
    const { error } = await sb.from("portal_remate_lotes").delete().eq("id", id);
    if (error) {
      setErr(error.message);
      return;
    }
    void load();
  }

  async function updateLoteMeta(loteId: string, patch: Partial<PortalRemateLoteRow>) {
    const sb = createClient();
    if (!sb) {
      setErr("Servicio de datos no disponible.");
      return;
    }
    setSavingLoteId(loteId);
    const payload: Record<string, unknown> = {};
    if (patch.estado !== undefined) payload.estado = patch.estado;
    if (patch.precio_reserva !== undefined) payload.precio_reserva = patch.precio_reserva;
    if (patch.precio_minimo_remate !== undefined) payload.precio_minimo_remate = patch.precio_minimo_remate;
    const { error } = await sb.from("portal_remate_lotes").update(payload).eq("id", loteId);
    setSavingLoteId(null);
    if (error) {
      setErr(error.message);
      return;
    }
    await load();
  }

  async function setOfertaGanadora(loteId: string, ofertaId: string | null) {
    const sb = createClient();
    if (!sb) {
      setErr("Servicio de datos no disponible.");
      return;
    }
    setSavingLoteId(loteId);
    const { data, error } = await sb.rpc("portal_admin_set_oferta_ganadora", {
      p_lote_id: loteId,
      p_oferta_id: ofertaId,
    });
    setSavingLoteId(null);
    if (error) {
      setErr(error.message);
      return;
    }
    const res = data as { ok?: boolean; error?: string } | null;
    if (!res?.ok) {
      setErr(res?.error ?? "No se pudo actualizar la oferta ganadora.");
      return;
    }
    if (ofertaId) {
      const oferta = ofertas.find((o) => o.oferta_id === ofertaId);
      const email = String(oferta?.cliente_email ?? "").trim().toLowerCase();
      if (email) {
        void fetch("/api/notifications/remate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event: "oferta_aceptada",
            loteId,
            email,
            monto: oferta?.monto ?? null,
          }),
        }).catch(() => null);
      }
    }
    await load();
  }

  function toggleSelect(row: Inv) {
    setSelectedInvById((prev) => {
      const next = new Map(prev);
      if (next.has(row.id)) next.delete(row.id);
      else next.set(row.id, row);
      return next;
    });
  }

  function toggleSelectAllOnPage() {
    const pageIds = modalRows.map((r) => r.id);
    const allSelected = pageIds.length > 0 && pageIds.every((id) => selectedInvById.has(id));
    setSelectedInvById((prev) => {
      const next = new Map(prev);
      if (allSelected) {
        pageIds.forEach((id) => next.delete(id));
      } else {
        modalRows.forEach((r) => next.set(r.id, r));
      }
      return next;
    });
  }

  async function confirmAddSelection() {
    const chosen = [...selectedInvById.values()];
    setAddingBulk(true);
    await addLotesBulk(chosen);
    setAddingBulk(false);
  }

  function toLocalDateTimeInput(iso: string | null): string {
    if (!iso) return "";
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return "";
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
  }

  const assignedCount = lotes.filter((l) => l.inventario_id).length;

  const missingDeploy = !isSupabaseConfigured();

  if (missingDeploy) {
    return (
      <div className="max-w-xl py-4">
        <SupabaseDeployWarning compact />
      </div>
    );
  }

  if (!remate && !err) {
    return <p className="text-neutral-400">Cargando remate…</p>;
  }

  if (!remate && err) {
    return (
      <div className="space-y-4">
        <Link href="/admin/remates" className="text-sm font-semibold text-[#33C7E3] hover:underline">
          ← Volver
        </Link>
        <p className="text-red-300">{err}</p>
      </div>
    );
  }

  if (!remate) return null;

  const pageFullySelected =
    modalRows.length > 0 && modalRows.every((r) => selectedInvById.has(r.id));

  return (
    <div className="space-y-8">
      <Link href="/admin/remates" className="text-sm font-semibold text-[#33C7E3] hover:underline">
        ← Volver al listado
      </Link>

      <form onSubmit={(e) => void saveRemate(e)} className="space-y-4 rounded-xl border border-white/10 bg-[#141c28] p-5">
        <h1 className="text-xl font-bold text-white">Editar remate</h1>
        {err ? <p className="text-sm text-red-300">{err}</p> : null}

        <label className="block text-sm">
          <span className="text-neutral-400">Título</span>
          <input
            name="titulo"
            defaultValue={remate.titulo}
            className="mt-1 w-full rounded border border-white/15 bg-black/30 px-3 py-2 text-white"
          />
        </label>
        <label className="block text-sm">
          <span className="text-neutral-400">Descripción</span>
          <textarea
            name="descripcion"
            defaultValue={remate.descripcion ?? ""}
            rows={3}
            className="mt-1 w-full rounded border border-white/15 bg-black/30 px-3 py-2 text-white"
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm">
            <span className="text-neutral-400">Inicio opcional</span>
            <input
              type="datetime-local"
              name="starts_at"
              defaultValue={toLocalDateTimeInput(remate.starts_at)}
              className="mt-1 w-full rounded border border-white/15 bg-black/30 px-3 py-2 text-white"
            />
          </label>
          <label className="text-sm">
            <span className="text-neutral-400">Cierre</span>
            <input
              required
              type="datetime-local"
              name="ends_at"
              defaultValue={toLocalDateTimeInput(remate.ends_at)}
              className="mt-1 w-full rounded border border-white/15 bg-black/30 px-3 py-2 text-white"
            />
          </label>
        </div>
        <label className="block text-sm">
          <span className="text-neutral-400">Estado</span>
          <select
            name="estado"
            defaultValue={remate.estado}
            className="mt-1 w-full rounded border border-white/15 bg-black/30 px-3 py-2 text-white"
          >
            <option value="borrador">borrador</option>
            <option value="publicado">publicado</option>
            <option value="en_curso">en curso (ofertas)</option>
            <option value="cerrado">cerrado</option>
          </select>
        </label>
        <button
          disabled={saving}
          type="submit"
          className="rounded bg-[#33C7E3] px-4 py-2 text-sm font-bold text-[#0f1f2c] disabled:opacity-50"
        >
          {saving ? "Guardando…" : "Guardar cambios"}
        </button>
      </form>

      <section className="rounded-xl border border-white/10 bg-[#141c28] p-5">
        <h2 className="text-lg font-bold text-white">Añadir desde inventario Tasaciones</h2>
        <p className="mt-1 text-sm text-neutral-400">
          Abra el inventario completo ({PAGE_SIZE} por página): buscador, marque varios ítems y agréguelos como lotes. Lo que
          ya está en este remate no vuelve a aparecer en la lista.
        </p>
        <button
          type="button"
          className="mt-4 rounded-lg border border-[#33C7E3]/50 bg-[#33C7E3]/15 px-4 py-3 text-sm font-bold text-[#33C7E3] hover:bg-[#33C7E3]/25"
          onClick={() => setInventoryOpen(true)}
        >
          Abrir inventario para seleccionar lotes…
        </button>
      </section>

      <section className="rounded-xl border border-white/10 bg-[#141c28] p-5">
        <h2 className="text-lg font-bold text-white">Timeline legal del remate</h2>
        <p className="mt-1 text-xs text-neutral-400">Publicación, cambios de estado, eventos de reserva y pujas registradas.</p>
        <ul className="mt-3 max-h-72 space-y-2 overflow-auto text-xs">
          {timeline.map((ev, i) => (
            <li key={`${ev.created_at}-${i}`} className="rounded border border-white/10 bg-black/20 px-3 py-2 text-neutral-300">
              <p className="font-semibold text-neutral-100">{ev.event_type}</p>
              <p className="text-neutral-500">{new Date(ev.created_at).toLocaleString("es-CL")}</p>
              <p className="mt-1 break-all text-neutral-400">{ev.detalle ? JSON.stringify(ev.detalle) : "—"}</p>
            </li>
          ))}
          {!timeline.length ? <li className="text-neutral-500">Sin eventos registrados todavía.</li> : null}
        </ul>
      </section>

      <section className="rounded-xl border border-white/10 bg-[#141c28] p-5">
        <h2 className="text-lg font-bold text-white">Lotes ({lotes.length})</h2>
        <div className="mt-4 overflow-x-auto rounded-lg border border-white/10">
          <table className="min-w-[980px] w-full border-collapse text-left text-sm">
            <thead className="bg-black/25 text-neutral-400">
              <tr>
                <th className="px-3 py-2 font-semibold">Lote</th>
                <th className="px-3 py-2 font-semibold">Base</th>
                <th className="px-3 py-2 font-semibold">Precio mínimo remate</th>
                <th className="px-3 py-2 font-semibold">Incremento mín.</th>
                <th className="px-3 py-2 font-semibold">Reserva</th>
                <th className="px-3 py-2 font-semibold">Estado</th>
                <th className="px-3 py-2 font-semibold">Acción</th>
              </tr>
            </thead>
            <tbody>
              {lotes.map((l) => (
                <tr key={l.id} className="border-t border-white/10 text-neutral-200">
                  <td className="px-3 py-2 font-semibold">{l.titulo ?? "Lote"}</td>
                  <td className="px-3 py-2 text-[#FFC600]">{formatClp(l.precio_base)}</td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      defaultValue={l.precio_minimo_remate ?? l.precio_base}
                      placeholder="Precio mínimo"
                      onBlur={(e) => {
                        const raw = e.target.value.trim();
                        const value = raw === "" ? null : Number(raw);
                        if (raw !== "" && (!Number.isFinite(value) || Number(value) < 0)) return;
                        if (Number(l.precio_minimo_remate ?? l.precio_base ?? -1) === Number(value ?? -1)) return;
                        void updateLoteMeta(l.id, { precio_minimo_remate: value as number | null });
                      }}
                      className="w-40 rounded border border-white/15 bg-black/35 px-2 py-1 text-xs text-white"
                      disabled={savingLoteId === l.id}
                    />
                  </td>
                  <td className="px-3 py-2">{formatClp(l.incremento_minimo)}</td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      defaultValue={l.precio_reserva ?? ""}
                      placeholder="Reserva"
                      onBlur={(e) => {
                        const raw = e.target.value.trim();
                        const value = raw === "" ? null : Number(raw);
                        if (raw !== "" && !Number.isFinite(value)) return;
                        if (Number(l.precio_reserva ?? -1) === Number(value ?? -1)) return;
                        void updateLoteMeta(l.id, { precio_reserva: value as number | null });
                      }}
                      className="w-28 rounded border border-white/15 bg-black/35 px-2 py-1 text-xs text-white"
                      disabled={savingLoteId === l.id}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={l.estado}
                      onChange={(e) =>
                        void updateLoteMeta(l.id, {
                          estado: e.target.value as PortalRemateLoteRow["estado"],
                        })
                      }
                      className="rounded border border-white/15 bg-black/35 px-2 py-1 text-xs text-white"
                      disabled={savingLoteId === l.id}
                    >
                      <option value="pendiente">pendiente</option>
                      <option value="activo">activo</option>
                      <option value="pausado">pausado</option>
                      <option value="adjudicado">adjudicado</option>
                      <option value="vendido">vendido</option>
                      <option value="anulado">anulado</option>
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <button type="button" className="text-xs text-red-300 hover:underline" onClick={() => void removeLote(l.id)}>
                      Quitar lote
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-white/10 bg-[#141c28] p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-white">Ofertas realizadas ({ofertas.length})</h2>
          <button
            type="button"
            className="rounded border border-white/20 px-3 py-1 text-xs text-neutral-200 hover:bg-white/5"
            onClick={() => void load()}
          >
            Actualizar
          </button>
        </div>
        {loadingOfertas ? <p className="mt-3 text-sm text-neutral-400">Cargando ofertas…</p> : null}
        {!loadingOfertas && ofertas.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-500">Aún no hay ofertas registradas para este remate.</p>
        ) : null}
        {!loadingOfertas && ofertas.length > 0 ? (
          <div className="mt-3 overflow-x-auto rounded-lg border border-white/10">
            <table className="min-w-[920px] w-full border-collapse text-left text-sm">
              <thead className="bg-black/25 text-neutral-400">
                <tr>
                  <th className="px-3 py-2 font-semibold">Cliente</th>
                  <th className="px-3 py-2 font-semibold">Usuario</th>
                  <th className="px-3 py-2 font-semibold">Email</th>
                  <th className="px-3 py-2 font-semibold">Lote</th>
                  <th className="px-3 py-2 font-semibold">Oferta</th>
                  <th className="px-3 py-2 font-semibold">Tipo</th>
                  <th className="px-3 py-2 font-semibold">Ganadora</th>
                  <th className="px-3 py-2 font-semibold">Alerta</th>
                  <th className="px-3 py-2 font-semibold">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {ofertas.map((o) => (
                  <tr
                    key={o.oferta_id}
                    className={`border-t border-white/10 text-neutral-200 ${
                      o.es_ganadora ? "bg-emerald-900/25" : o.sospechosa ? "bg-amber-900/20" : ""
                    }`}
                  >
                    <td className="px-3 py-2">{o.cliente_nombre || "Sin nombre"}</td>
                    <td className="px-3 py-2 font-mono text-xs">{o.cliente_usuario || "—"}</td>
                    <td className="px-3 py-2">{o.cliente_email || "—"}</td>
                    <td className="px-3 py-2">{o.lote_titulo || "Lote"}</td>
                    <td className="px-3 py-2 font-bold text-[#FFC600]">{formatClp(o.monto)}</td>
                    <td className="px-3 py-2">{o.es_auto ? "Auto" : "Manual"}</td>
                    <td className="px-3 py-2">
                      {o.es_ganadora ? (
                        <div className="flex items-center gap-2">
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700">Ganadora</span>
                          <button
                            type="button"
                            className="text-xs text-emerald-200 hover:underline disabled:opacity-50"
                            disabled={savingLoteId === o.lote_id}
                            onClick={() => void setOfertaGanadora(o.lote_id, null)}
                          >
                            Quitar
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="rounded border border-emerald-400/40 px-2 py-1 text-[11px] font-semibold text-emerald-200 hover:bg-emerald-500/10 disabled:opacity-50"
                          disabled={savingLoteId === o.lote_id}
                          onClick={() => void setOfertaGanadora(o.lote_id, o.oferta_id)}
                        >
                          Marcar ganadora
                        </button>
                      )}
                    </td>
                    <td className="px-3 py-2">{o.sospechosa ? (o.motivo_sospecha ?? "Revisar") : "—"}</td>
                    <td className="px-3 py-2 text-neutral-400">{new Date(o.fecha).toLocaleString("es-CL")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      {inventoryOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-labelledby="inv-modal-title" aria-modal>
          <div className="flex max-h-[min(90vh,800px)] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-white/15 bg-[#141c28] shadow-xl">
            <header className="flex shrink-0 flex-wrap items-start justify-between gap-3 border-b border-white/10 px-5 py-4 sm:px-6">
              <div>
                <h3 id="inv-modal-title" className="text-lg font-bold text-white">
                  Inventario Tasaciones
                </h3>
                <p className="mt-1 text-sm text-neutral-400">
                  {modalTotal.toLocaleString("es-CL")} ítem
                  {modalTotal === 1 ? "" : "s"} disponibles
                  {assignedCount ? ` (${assignedCount} ya en este remate, ocultos)` : ""}.
                </p>
              </div>
              <button
                type="button"
                className="rounded-lg border border-white/20 p-1.5 text-neutral-300 hover:bg-white/5 hover:text-white"
                aria-label="Cerrar modal de inventario"
                onClick={() => setInventoryOpen(false)}
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
                </svg>
              </button>
            </header>

            <div className="shrink-0 border-b border-white/10 px-5 py-3 sm:px-6">
              <label className="block text-sm text-neutral-400">
                Buscador
                <input
                  value={modalSearch}
                  onChange={(e) => setModalSearch(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-white/15 bg-black/35 px-3 py-2 text-white placeholder:text-neutral-600"
                  placeholder="Vacío = todo el inventario. Con 2+ caracteres filtra patente / marca / modelo."
                />
              </label>
            </div>

            <div className="min-h-0 flex-1 overflow-auto px-5 py-4 sm:px-6">
              {modalLoading ? <p className="text-sm text-neutral-400">Cargando…</p> : null}
              {!modalLoading && modalRows.length === 0 ? (
                <p className="text-sm text-neutral-500">
                  {modalSearchDebounced.trim().length >= 2
                    ? "Sin resultados para la búsqueda."
                    : "No hay más ítems para agregar con los filtros actuales."}
                </p>
              ) : null}

              {!modalLoading && modalRows.length > 0 ? (
                <table className="w-full min-w-[560px] border-collapse text-left text-sm">
                  <thead className="sticky top-0 z-[1] bg-[#141c28] text-xs font-bold uppercase tracking-wide text-neutral-500 shadow-[0_1px_0_0_rgba(255,255,255,0.08)]">
                    <tr>
                      <th className="w-12 py-3 pr-2">
                        <input
                          type="checkbox"
                          checked={pageFullySelected}
                          onChange={toggleSelectAllOnPage}
                          title="Seleccionar esta página"
                          className="h-4 w-4 accent-[#33C7E3]"
                          aria-label="Seleccionar todos en esta página"
                        />
                      </th>
                      <th className="w-14 py-3 pr-2"> </th>
                      <th className="py-3 pr-2">Patente</th>
                      <th className="py-3 pr-2">Vehículo</th>
                      <th className="hidden py-3 pr-2 md:table-cell">Categoría</th>
                      <th className="py-3 text-right">Valor ref.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {modalRows.map((row) => {
                      const invRow = row as InventarioRow & Record<string, unknown>;
                      const thumb = preferredThumbnailUrl(invRow);
                      const gloViewer = firstGlo3dViewerUrl(invRow);
                      const checked = selectedInvById.has(row.id);
                      return (
                        <tr key={row.id} className="border-t border-white/10">
                          <td className="py-2 align-middle">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleSelect(row)}
                              className="h-4 w-4 accent-[#33C7E3]"
                              aria-label={`Seleccionar ${row.patente ?? row.id}`}
                            />
                          </td>
                          <td className="py-2 align-middle">
                            <div className="flex h-10 w-[3.5rem] items-center justify-center overflow-hidden rounded border border-white/10 bg-black/40">
                              {thumb ? (
                                /* eslint-disable-next-line @next/next/no-img-element */
                                <img src={thumb} alt="" className="h-full w-full object-cover" loading="lazy" />
                              ) : gloViewer ? (
                                <a
                                  href={gloViewer}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex h-full w-full flex-col items-center justify-center bg-neutral-950 px-0.5 text-center text-[7px] font-bold leading-tight text-[#33C7E3] hover:bg-neutral-900 hover:underline"
                                  title={`Abrir visor 360° / Glo3D (${String(row.patente ?? "").trim() || "vehículo"})`}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <span className="text-[8px]">360°</span>
                                  <span className="font-normal opacity-75">visor</span>
                                </a>
                              ) : (
                                <span className="px-1 text-center text-[9px] text-neutral-600">—</span>
                              )}
                            </div>
                          </td>
                          <td className="py-2 align-middle font-semibold text-white">{row.patente ?? "—"}</td>
                          <td className="py-2 align-middle text-neutral-300">
                            {[row.marca, row.modelo].filter(Boolean).join(" ") || "—"}
                          </td>
                          <td className="hidden py-2 align-middle text-neutral-500 md:table-cell">
                            {row.categoria ? String(row.categoria) : "—"}
                          </td>
                          <td className="py-2 text-right align-middle tabular-nums text-[#FFC600]">{formatClp(row.valor_minimo ?? null)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : null}
            </div>

            <footer className="flex shrink-0 flex-col gap-4 border-t border-white/10 bg-[#161d28] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <div className="flex flex-wrap items-center gap-3 text-xs text-neutral-400">
                <span>
                  Página{" "}
                  <strong className="text-neutral-200">
                    {modalPage} / {totalPages}
                  </strong>
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={modalPage <= 1 || modalLoading}
                    className="rounded border border-white/20 px-3 py-1.5 text-neutral-200 disabled:opacity-40"
                    onClick={() => setModalPage((p) => Math.max(1, p - 1))}
                  >
                    Anterior
                  </button>
                  <button
                    type="button"
                    disabled={modalPage >= totalPages || modalLoading}
                    className="rounded border border-white/20 px-3 py-1.5 text-neutral-200 disabled:opacity-40"
                    onClick={() => setModalPage((p) => Math.min(totalPages, p + 1))}
                  >
                    Siguiente
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-white/20 px-4 py-2 text-sm text-neutral-200"
                  onClick={() => setInventoryOpen(false)}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={addingBulk || selectedInvById.size === 0}
                  className="rounded-lg bg-[#FFC600] px-4 py-2 text-sm font-black text-neutral-900 disabled:opacity-50"
                  onClick={() => void confirmAddSelection()}
                >
                  {addingBulk ? "Agregando…" : `Agregar ${selectedInvById.size} seleccionado${selectedInvById.size === 1 ? "" : "s"}`}
                </button>
              </div>
            </footer>
          </div>
        </div>
      ) : null}
      {dialogElement}
    </div>
  );
}
