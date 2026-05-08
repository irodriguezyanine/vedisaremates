"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import type { PortalRemateRow } from "@/lib/portal-types";
import { SupabaseDeployWarning } from "@/components/supabase-deploy-warning";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/public-env";

export function RematesList() {
  const [items, setItems] = useState<PortalRemateRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    const sb = createClient();
    if (!sb) {
      setErr("No hay conexión configurada para cargar remates.");
      return;
    }
    const { data, error } = await sb.from("portal_remates").select("*").order("created_at", { ascending: false });
    if (error) {
      setErr("No se pudo obtener el listado. Revisá tu conexión e intentá de nuevo.");
      return;
    }
    setItems(((data ?? []) as PortalRemateRow[]) || []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function nuevo() {
    setErr(null);
    const sb = createClient();
    if (!sb) {
      setErr("No hay servicio de datos en este entorno.");
      return;
    }
    const {
      data: { user },
    } = await sb.auth.getUser();
    const ends = new Date(Date.now() + 7 * 86400000).toISOString();
    const { data, error } = await sb
      .from("portal_remates")
      .insert({
        titulo: "Nuevo remate",
        estado: "borrador",
        ends_at: ends,
        created_by: user?.id ?? null,
      })
      .select("id")
      .single();

    if (error) {
      setErr("No se pudo crear el borrador. ¿Tenés permisos de administrador?");
      return;
    }
    if (data?.id) {
      window.location.href = `/admin/remates/${data.id}`;
    }
  }

  async function eliminarRemate(r: PortalRemateRow) {
    const ok = window.confirm(
      `¿Eliminar permanentemente el remate «${r.titulo}» y todos sus lotes? Esta acción no se puede deshacer.`,
    );
    if (!ok) return;

    setErr(null);
    const sb = createClient();
    if (!sb) {
      setErr("No hay servicio de datos.");
      return;
    }
    setDeletingId(r.id);
    const { error } = await sb.from("portal_remates").delete().eq("id", r.id);
    setDeletingId(null);
    if (error) {
      setErr("No se pudo eliminar. Revisá permisos o intentá más tarde.");
      return;
    }
    await load();
  }

  const badge = (e: PortalRemateRow["estado"]) => {
    const map: Record<typeof e, string> = {
      borrador: "bg-neutral-600",
      publicado: "bg-sky-600",
      en_curso: "bg-emerald-600",
      cerrado: "bg-neutral-800",
    };
    return (
      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase text-white ${map[e]}`}>
        {e.replaceAll("_", " ")}
      </span>
    );
  };

  const missingDeploy = !isSupabaseConfigured();

  if (missingDeploy) {
    return (
      <div className="max-w-xl py-4">
        <SupabaseDeployWarning compact />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Remates y lotes</h1>
          <p className="mt-1 text-sm text-neutral-400">
            Acá ves <strong className="font-medium text-neutral-200">todos</strong> los remates de la base (incluidos
            borradores). La home pública solo muestra eventos publicados, en curso o cerrados para visitantes; las tarjetas
            de ejemplo del inicio no son remates reales hasta que existan acá.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-lg border border-white/20 px-4 py-2 text-sm font-semibold text-white hover:bg-white/5"
          >
            Refrescar
          </button>
          <button
            type="button"
            onClick={() => void nuevo()}
            className="rounded-lg bg-[#FFC600] px-4 py-2 text-sm font-black text-neutral-900 hover:brightness-105"
          >
            Nuevo remate
          </button>
        </div>
      </div>

      {err ? <p className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">{err}</p> : null}

      <ul className="space-y-3">
        {items.map((r) => (
          <li key={r.id}>
            <div className="flex flex-col gap-4 rounded-xl border border-white/10 bg-[#141c28] p-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 flex-1">
                <Link
                  href={`/admin/remates/${r.id}`}
                  className="inline-block text-base font-semibold text-white decoration-[#33C7E3]/50 underline-offset-2 hover:text-[#33C7E3] hover:underline"
                >
                  {r.titulo}
                </Link>
                <p className="mt-1 text-xs text-neutral-500">
                  Fin programado: {new Date(r.ends_at).toLocaleString("es-CL")} · Identificador corto {r.id.slice(0, 8)}…
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                {badge(r.estado)}
                <Link
                  href={`/admin/remates/${r.id}`}
                  className="rounded-lg border border-[#33C7E3]/50 bg-[#33C7E3]/10 px-3 py-2 text-xs font-bold text-[#33C7E3] hover:bg-[#33C7E3]/20"
                >
                  Editar
                </Link>
                <Link
                  href={`/subastas/${r.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg border border-white/20 px-3 py-2 text-xs font-semibold text-neutral-200 hover:bg-white/10"
                >
                  Sala pública
                </Link>
                <button
                  type="button"
                  disabled={deletingId === r.id}
                  className="rounded-lg border border-red-500/40 px-3 py-2 text-xs font-semibold text-red-200 hover:bg-red-500/10 disabled:opacity-50"
                  onClick={() => void eliminarRemate(r)}
                >
                  {deletingId === r.id ? "Eliminando…" : "Eliminar"}
                </button>
              </div>
            </div>
          </li>
        ))}
        {!items.length ? (
          <p className="text-neutral-500">Aún no hay remates en la base. Creá el primero con «Nuevo remate».</p>
        ) : null}
      </ul>
    </div>
  );
}
