"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { formatClp } from "@/lib/format-clp";
import type { InventarioRow, PortalRemateLoteRow, PortalRemateRow } from "@/lib/portal-types";
import { createClient } from "@/lib/supabase/client";

type Inv = InventarioRow & { id: string };

export function RemateEditor({ remateId }: { remateId: string }) {
  const [remate, setRemate] = useState<PortalRemateRow | null>(null);
  const [lotes, setLotes] = useState<PortalRemateLoteRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [hits, setHits] = useState<Inv[]>([]);
  const [invLoading, setInvLoading] = useState(false);

  const load = useCallback(async () => {
    const sb = createClient();
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

  useEffect(() => {
    const t = window.setTimeout(() => {
      void (async () => {
        const qRaw = search.trim();
        const qSafe = qRaw.replace(/%/g, "").slice(0, 42);
        if (qSafe.length < 2) {
          setHits([]);
          return;
        }
        setInvLoading(true);
        const sb = createClient();
        const pattern = `%${qSafe}%`;
        const { data, error } = await sb
          .from("inventario")
          .select("id, patente, marca, modelo, valor_minimo, categoria")
          .or(`patente.ilike.${pattern},marca.ilike.${pattern},modelo.ilike.${pattern}`)
          .limit(20);
        if (error) {
          setInvLoading(false);
          return;
        }
        setHits((data as Inv[]) ?? []);
        setInvLoading(false);
      })();
    }, 400);
    return () => window.clearTimeout(t);
  }, [search]);

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

  async function addLote(inv: Inv) {
    const sb = createClient();
    const next = lotes.length ? Math.max(...lotes.map((x) => x.orden)) + 1 : 0;
    const titulo = [inv.marca, inv.modelo, inv.patente].filter(Boolean).join(" · ") || inv.patente || "Lote";
    const base = Number(inv.valor_minimo ?? 0) || 0;
    const { error } = await sb.from("portal_remate_lotes").insert({
      remate_id: remateId,
      inventario_id: inv.id,
      titulo,
      orden: next,
      precio_base: base,
      incremento_minimo: 50000,
    });
    if (error) {
      setErr(error.message);
      return;
    }
    void load();
  }

  async function removeLote(id: string) {
    if (!window.confirm("¿Eliminar este lote?")) return;
    const sb = createClient();
    const { error } = await sb.from("portal_remate_lotes").delete().eq("id", id);
    if (error) {
      setErr(error.message);
      return;
    }
    void load();
  }

  const toLocal = (iso: string | null) => (iso ? iso.slice(0, 16) : "");

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
        <p className="mt-1 text-sm text-neutral-400">Buscá por patente o modelo (mín. 2 caracteres).</p>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mt-3 w-full rounded border border-white/15 bg-black/30 px-3 py-2 text-white"
          placeholder="Ej. ABCD12, Toyota…"
        />
        {invLoading ? <p className="mt-2 text-xs text-neutral-500">Buscando…</p> : null}
        <ul className="mt-3 max-h-52 space-y-1 overflow-auto">
          {hits.map((h) => (
            <li
              key={h.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded border border-white/10 px-2 py-1 text-sm text-neutral-200"
            >
              <span className="min-w-0 truncate">
                {h.patente} — {h.marca} {h.modelo} ({formatClp(h.valor_minimo ?? null)})
              </span>
              <button type="button" className="shrink-0 text-xs font-bold text-[#FFC600]" onClick={() => void addLote(h)}>
                Agregar lote
              </button>
            </li>
          ))}
        </ul>
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
    </div>
  );
}
