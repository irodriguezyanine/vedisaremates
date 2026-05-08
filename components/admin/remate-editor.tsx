"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { formatClp } from "@/lib/format-clp";
import type { InventarioRow, PortalRemateLoteRow, PortalRemateRow } from "@/lib/portal-types";
import { preferredThumbnailUrl } from "@/lib/inventario-media";
import { SupabaseDeployWarning } from "@/components/supabase-deploy-warning";
import { createClient } from "@/lib/supabase/client";
import { getPublicSupabaseEnv, isSupabaseConfigured } from "@/lib/supabase/public-env";

type Inv = InventarioRow & { id: string };

const PAGE_SIZE = 20;

function escapedIlike(term: string) {
  return term.replace(/%/g, "").replace(/,/g, " ").replace(/[()]/g, "").slice(0, 42);
}

export function RemateEditor({ remateId }: { remateId: string }) {
  const [remate, setRemate] = useState<PortalRemateRow | null>(null);
  const [lotes, setLotes] = useState<PortalRemateLoteRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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

    let q = sb.from("inventario").select("id, patente, marca, modelo, valor_minimo, categoria, imagenes", { count: "exact" });

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

    const sb = createClient();
    if (!sb) {
      setErr("Servicio de datos no disponible.");
      setSaving(false);
      return;
    }
    const { error } = await sb
      .from("portal_remates")
      .update({
        titulo: String(fd.get("titulo") ?? "").trim(),
        descripcion: String(fd.get("descripcion") ?? "").trim() || null,
        estado: fd.get("estado") as PortalRemateRow["estado"],
        starts_at: starts ? new Date(starts).toISOString() : null,
        ends_at: ends ? new Date(ends).toISOString() : remate.ends_at,
      })
      .eq("id", remate.id);

    setSaving(false);
    if (error) {
      setErr(error.message);
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
      const row = {
        remate_id: remateId,
        inventario_id: inv.id,
        titulo,
        orden: nextOrden,
        precio_base: base,
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
    if (!window.confirm("¿Eliminar este lote?")) return;
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

  const toLocal = (iso: string | null) => (iso ? iso.slice(0, 16) : "");

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
              defaultValue={toLocal(remate.starts_at)}
              className="mt-1 w-full rounded border border-white/15 bg-black/30 px-3 py-2 text-white"
            />
          </label>
          <label className="text-sm">
            <span className="text-neutral-400">Cierre</span>
            <input
              required
              type="datetime-local"
              name="ends_at"
              defaultValue={toLocal(remate.ends_at)}
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
          Abrí el inventario completo ({PAGE_SIZE} por página): buscador, marcá varios ítems y sumalos como lotes. Lo que ya está
          en este remate no vuelve a aparecer en la lista.
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
        <h2 className="text-lg font-bold text-white">Lotes ({lotes.length})</h2>
        <ul className="mt-4 space-y-3">
          {lotes.map((l) => (
            <li key={l.id} className="flex flex-col gap-2 rounded border border-white/10 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold text-white">{l.titulo ?? "Lote"}</p>
                <p className="text-xs text-neutral-500">
                  Base {formatClp(l.precio_base)} · incremento mín. {formatClp(l.incremento_minimo)}
                </p>
              </div>
              <button type="button" className="text-xs text-red-300 hover:underline sm:shrink-0" onClick={() => void removeLote(l.id)}>
                Quitar lote
              </button>
            </li>
          ))}
        </ul>
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
              <button type="button" className="text-sm text-neutral-300 hover:text-white" onClick={() => setInventoryOpen(false)}>
                Cerrar
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
                      const thumb = preferredThumbnailUrl(row as InventarioRow & Record<string, unknown>);
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
    </div>
  );
}
