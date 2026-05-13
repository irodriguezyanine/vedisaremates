"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type SVGProps } from "react";

import type { PortalRemateRow } from "@/lib/portal-types";
import { SupabaseDeployWarning } from "@/components/supabase-deploy-warning";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/public-env";

function IconPlus(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden {...props}>
      <path strokeWidth="2" strokeLinecap="round" d="M12 5v14M5 12h14" />
    </svg>
  );
}

function IconPencil(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden {...props}>
      <path
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 21h4l11.6-11.6a2 2 0 0 0 0-2.8L17.8 5a2 2 0 0 0-2.8 0L4 17.2V21z"
      />
      <path strokeWidth="2" strokeLinecap="round" d="m14 7 4 4" />
    </svg>
  );
}

function IconTrash(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden {...props}>
      <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M10 11v6M14 11v6M9 7V5h6v2" />
      <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M6 7l1 14h10l1-14" />
    </svg>
  );
}

function IconArrowPath(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden {...props}>
      <path
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21 12a9 9 0 0 1-14 8M19 21v-7h-7M3 12a9 9 0 0 1 14-8M5 3v7h7"
      />
    </svg>
  );
}

const ICON_BTN =
  "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors disabled:opacity-50";

export function RematesList() {
  const [items, setItems] = useState<PortalRemateRow[]>([]);
  const [vehicleCountByRemate, setVehicleCountByRemate] = useState<Record<string, number>>({});
  const [err, setErr] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async () => {
    setErr(null);
    const sb = createClient();
    if (!sb) {
      setErr("No hay conexión configurada para cargar remates.");
      setLoadingList(false);
      return;
    }
    setSyncing(true);
    // Backfill best-effort para reflejar rápidamente cambios creados desde Tasaciones.
    // Si falla, no bloqueamos el listado del panel.
    try {
      await sb.rpc("portal_integracion_bootstrap_desde_tasaciones", { p_limit: 1000 });
      await sb.rpc("portal_integracion_procesar_outbox", { p_limit: 1000 });
    } catch {
      // Best-effort: errores de sync no deben impedir listar remates.
    } finally {
      setSyncing(false);
    }

    const { data, error } = await sb.from("portal_remates").select("*").order("created_at", { ascending: false });
    if (error) {
      setErr(error.message || "No se pudo obtener el listado. Revise su conexión e intente nuevamente.");
      setLoadingList(false);
      return;
    }
    const rows = ((data ?? []) as PortalRemateRow[]) || [];
    setItems(rows);

    if (!rows.length) {
      setVehicleCountByRemate({});
      setLoadingList(false);
      return;
    }

    const remateIds = rows.map((row) => row.id);
    const { data: lotesData } = await sb.from("portal_remate_lotes").select("remate_id").in("remate_id", remateIds);
    const countMap: Record<string, number> = {};
    for (const row of (lotesData ?? []) as Array<{ remate_id: string | null }>) {
      if (!row.remate_id) continue;
      countMap[row.remate_id] = (countMap[row.remate_id] ?? 0) + 1;
    }
    setVehicleCountByRemate(countMap);
    setLoadingList(false);
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
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
      setErr("No se pudo crear el borrador. ¿Tiene permisos de administrador?");
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
      setErr("No se pudo eliminar. Revise permisos o intente más tarde.");
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
            Aquí ve <strong className="font-medium text-neutral-200">todos</strong> los remates de la base (incluidos
            borradores). La home pública solo muestra eventos publicados, en curso o cerrados para visitantes; las tarjetas
            de ejemplo del inicio no son remates reales hasta que existan aquí.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={loadingList || syncing}
            onClick={() => {
              setLoadingList(true);
              void load();
            }}
            className="inline-flex items-center gap-2 rounded-lg border border-white/20 px-4 py-2 text-sm font-semibold text-white hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <IconArrowPath className={loadingList || syncing ? "animate-spin" : ""} />
            {loadingList ? "Actualizando…" : syncing ? "Sincronizando…" : "Refrescar"}
          </button>
          <button
            type="button"
            onClick={() => void nuevo()}
            title="Nuevo remate"
            aria-label="Nuevo remate"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#FFC600] text-neutral-900 hover:brightness-105"
          >
            <IconPlus />
          </button>
        </div>
      </div>

      {err ? <p className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">{err}</p> : null}

      <ul className="space-y-3">
        {items.map((r) => (
          <li key={r.id}>
            <div className="flex flex-col gap-4 rounded-xl border border-white/10 bg-[#141c28] p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 flex-1">
                <Link
                  href={`/admin/remates/${r.id}`}
                  className="inline-block text-base font-semibold text-white decoration-[#33C7E3]/50 underline-offset-2 hover:text-[#33C7E3] hover:underline"
                >
                  {r.titulo}
                </Link>
                <p className="mt-1 text-xs text-neutral-500">Fin programado: {new Date(r.ends_at).toLocaleString("es-CL")}</p>
              </div>
              <div className="shrink-0 text-sm font-semibold text-white sm:px-3">
                {vehicleCountByRemate[r.id] ?? 0} vehículos
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                {badge(r.estado)}
                <Link
                  href={`/admin/remates/${r.id}`}
                  title="Editar remate"
                  aria-label="Editar remate"
                  className={`${ICON_BTN} border border-[#33C7E3]/50 bg-[#33C7E3]/10 text-[#33C7E3] hover:bg-[#33C7E3]/20`}
                >
                  <IconPencil />
                </Link>
                <button
                  type="button"
                  disabled={deletingId === r.id}
                  title="Eliminar remate"
                  aria-label="Eliminar remate"
                  className={`${ICON_BTN} border border-red-500/40 text-red-200 hover:bg-red-500/10`}
                  onClick={() => void eliminarRemate(r)}
                >
                  {deletingId === r.id ? (
                    <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-red-200/30 border-t-red-200" />
                  ) : (
                    <IconTrash />
                  )}
                </button>
              </div>
            </div>
          </li>
        ))}
        {!items.length ? (
          <p className="text-neutral-500">Aún no hay remates en la base. Cree el primero con el botón + arriba a la derecha.</p>
        ) : null}
      </ul>
    </div>
  );
}
