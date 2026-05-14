"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type SVGProps } from "react";

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
const PAGE_SIZE = 5;

type TipoVistaEvento = "remate" | "venta_directa";
type EstadoFiltro = "todos" | "abierto" | "cerrado";

function normalizarTexto(value: string | null | undefined): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function esVentaDirectaPortal(row: PortalRemateRow): boolean {
  const texto = normalizarTexto(`${row.titulo ?? ""} ${row.descripcion ?? ""}`);
  return (
    texto.includes("ventadirecta") ||
    texto.includes("vtadirecta") ||
    texto.includes("vtdirecta") ||
    texto.includes("ventadir")
  );
}

function limpiarTituloEvento(value: string | null | undefined): string {
  const raw = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!raw) return "Sin título";
  const parts = raw
    .split(/\s*-\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length <= 1) return raw;

  const seen = new Set<string>();
  const dedup: string[] = [];
  for (const part of parts) {
    const key = normalizarTexto(part);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    dedup.push(part);
    if (dedup.length >= 8) break;
  }
  const merged = dedup.join(" - ").trim();
  return merged || "Sin título";
}

function truncarTexto(value: string, max = 120): string {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 1)).trim()}…`;
}

function tituloEventoCard(value: string | null | undefined): string {
  return truncarTexto(limpiarTituloEvento(value), 120);
}

function etiquetaOrigenSimple(sourceSystem: string | null | undefined): string {
  const source = String(sourceSystem ?? "").trim().toLowerCase();
  if (source === "portal" || source === "subastas") return "Subastas";
  if (source === "catalogo") return "Catálogo";
  if (source === "tasaciones") return "Tasaciones";
  if (!source) return "Subastas";
  return source.charAt(0).toUpperCase() + source.slice(1);
}

function esErrorDeadlock(error: unknown): boolean {
  const text = String(error ?? "").toLowerCase();
  return text.includes("deadlock");
}

function isTransientInfraError(error: unknown): boolean {
  const text = String(error ?? "").toLowerCase();
  return (
    text.includes("520") ||
    text.includes("502") ||
    text.includes("503") ||
    text.includes("504") ||
    text.includes("cloudflare") ||
    text.includes("statement timeout") ||
    text.includes("canceling statement due to statement timeout") ||
    text.includes("failed to load resource") ||
    text.includes("network")
  );
}

function formatUiError(error: unknown, fallback: string): string {
  const raw = String(error ?? "").trim();
  if (!raw) return fallback;
  const lower = raw.toLowerCase();
  if (
    lower.includes("<html") ||
    lower.includes("<!doctype html") ||
    lower.includes("cloudflare") ||
    lower.includes("error 520")
  ) {
    return "Servicio temporalmente inestable. Reintenta en unos segundos.";
  }
  return raw.length > 220 ? `${raw.slice(0, 220)}…` : raw;
}

export function RematesList() {
  const [items, setItems] = useState<PortalRemateRow[]>([]);
  const [vehicleCountByRemate, setVehicleCountByRemate] = useState<Record<string, number>>({});
  const [err, setErr] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncStats, setSyncStats] = useState<{ pending: number; failed: number; done_today: number } | null>(null);
  const [tipoVista, setTipoVista] = useState<TipoVistaEvento>("remate");
  const [estadoFiltro, setEstadoFiltro] = useState<EstadoFiltro>("abierto");
  const [paginaActual, setPaginaActual] = useState(1);
  const autoSyncIntentadoRef = useRef(false);

  const load = useCallback(async () => {
    setErr(null);
    const sb = createClient();
    if (!sb) {
      setErr("No hay conexión configurada para cargar remates.");
      setLoadingList(false);
      return;
    }
    let data: PortalRemateRow[] | null = null;
    let errorMessage = "";
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const { data: rowsData, error } = await sb
        .from("portal_remates")
        .select("*")
        .order("created_at", { ascending: false });
      if (!error) {
        data = (rowsData ?? []) as PortalRemateRow[];
        errorMessage = "";
        break;
      }
      errorMessage = error.message || "No se pudo obtener el listado.";
      if (!isTransientInfraError(errorMessage) || attempt === 2) break;
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
    if (errorMessage) {
      setErr(formatUiError(errorMessage, "No se pudo obtener el listado. Revise su conexión e intente nuevamente."));
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
    try {
      const statsRes = await fetch("/api/admin/sync", { cache: "no-store" });
      const statsPayload = (await statsRes.json().catch(() => ({}))) as { stats?: Record<string, unknown> };
      const first = statsPayload.stats;
      if (statsRes.ok && first && typeof first === "object") {
        setSyncStats({
          pending: Number((first as Record<string, unknown>).pending ?? 0),
          failed: Number((first as Record<string, unknown>).failed ?? 0),
          done_today: Number((first as Record<string, unknown>).done_today ?? 0),
        });
      }
    } catch {
      setSyncStats(null);
    }
    setLoadingList(false);
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, [load]);

  useEffect(() => {
    if (autoSyncIntentadoRef.current) return;
    const hayPendientes = (syncStats?.pending ?? 0) > 0 || (syncStats?.failed ?? 0) > 0;
    const listaVacia = items.length === 0;
    if (!hayPendientes && !listaVacia) return;
    autoSyncIntentadoRef.current = true;
    void sincronizarAhora(true);
  }, [items.length, syncStats]);

  const itemsFiltrados = useMemo(() => {
    return items.filter((row) => {
      const esVentaDirecta = esVentaDirectaPortal(row);
      if (tipoVista === "venta_directa" && !esVentaDirecta) return false;
      if (tipoVista === "remate" && esVentaDirecta) return false;
      if (estadoFiltro === "cerrado") return row.estado === "cerrado";
      if (estadoFiltro === "abierto") return row.estado !== "cerrado";
      return true;
    });
  }, [estadoFiltro, items, tipoVista]);

  const totalPaginas = Math.max(1, Math.ceil(itemsFiltrados.length / PAGE_SIZE));
  const paginaSegura = Math.min(Math.max(1, paginaActual), totalPaginas);
  const inicio = (paginaSegura - 1) * PAGE_SIZE;
  const itemsPagina = itemsFiltrados.slice(inicio, inicio + PAGE_SIZE);

  useEffect(() => {
    setPaginaActual(1);
  }, [tipoVista, estadoFiltro]);

  useEffect(() => {
    if (paginaActual > totalPaginas) setPaginaActual(totalPaginas);
  }, [paginaActual, totalPaginas]);

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
    const cerrarPrimero = window.confirm(
      `¿Quieres cerrar y despublicar «${r.titulo}»? Recomendado para evitar pérdidas de sincronización.`,
    );
    if (cerrarPrimero) {
      const sb = createClient();
      if (!sb) {
        setErr("No hay servicio de datos.");
        return;
      }
      const { error: closeError } = await sb
        .from("portal_remates")
        .update({ estado: "cerrado" })
        .eq("id", r.id);
      if (closeError) {
        setErr(formatUiError(closeError.message, "No se pudo cerrar el remate."));
      } else {
        await load();
      }
      return;
    }
    const confirmDelete = window.confirm(
      `Vas a eliminar permanentemente «${r.titulo}». ¿Confirmas borrado definitivo?`,
    );
    if (!confirmDelete) return;
    const typed = window.prompt("Escribe ELIMINAR para confirmar el borrado permanente");
    if (typed !== "ELIMINAR") return;

    setErr(null);
    setDeletingId(r.id);
    const response = await fetch("/api/admin/remates/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ remateId: r.id }),
    });
    const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    setDeletingId(null);
    if (!response.ok || !payload.ok) {
      setErr(formatUiError(payload.error, "No se pudo eliminar. Revise permisos o intente más tarde."));
      return;
    }
    await load();
  }

  async function sincronizarAhora(silentDeadlock = false) {
    setErr(null);
    setSyncing(true);
    try {
      const response = await fetch("/api/admin/sync", { method: "POST" });
      const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? `Error HTTP ${response.status}`);
      }
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "No se pudo completar la sincronización.";
      if (esErrorDeadlock(msg)) {
        // Si el outbox está ocupado en otra transacción, evitamos ensuciar la UI con error técnico.
        if (!silentDeadlock) {
          setErr("Sincronización en curso. Intenta nuevamente en unos segundos.");
        } else {
          setErr(null);
        }
      } else {
        setErr(formatUiError(msg, "No se pudo completar la sincronización."));
      }
    } finally {
      setSyncing(false);
    }
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
          {syncStats ? (
            <p className="mt-2 text-xs text-neutral-400">
              Sync outbox: pendientes {syncStats.pending} · fallidos {syncStats.failed} · procesados hoy {syncStats.done_today}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={syncing}
            onClick={() => void sincronizarAhora()}
            className="inline-flex items-center gap-2 rounded-lg border border-cyan-400/30 px-4 py-2 text-sm font-semibold text-cyan-200 hover:bg-cyan-400/10 disabled:opacity-60"
          >
            <IconArrowPath className={syncing ? "animate-spin" : ""} />
            {syncing ? "Sincronizando..." : "Sincronizar ahora"}
          </button>
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

      <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-[#141c28] p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex items-center gap-2">
          <button
            type="button"
            onClick={() => setTipoVista("remate")}
            className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
              tipoVista === "remate"
                ? "bg-[#33C7E3]/25 text-[#8de7f7] border border-[#33C7E3]/60"
                : "border border-white/15 text-neutral-300 hover:bg-white/5"
            }`}
          >
            Remates
          </button>
          <button
            type="button"
            onClick={() => setTipoVista("venta_directa")}
            className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
              tipoVista === "venta_directa"
                ? "bg-[#33C7E3]/25 text-[#8de7f7] border border-[#33C7E3]/60"
                : "border border-white/15 text-neutral-300 hover:bg-white/5"
            }`}
          >
            Ventas directas
          </button>
        </div>
        <div className="inline-flex items-center gap-2">
          <label className="text-sm text-neutral-300" htmlFor="filtro-estado-remates-admin">
            Estado
          </label>
          <select
            id="filtro-estado-remates-admin"
            value={estadoFiltro}
            onChange={(e) => setEstadoFiltro(e.target.value as EstadoFiltro)}
            className="rounded-lg border border-white/15 bg-[#0e1520] px-3 py-2 text-sm text-white outline-none focus:border-[#33C7E3]"
          >
            <option value="todos">Todos</option>
            <option value="abierto">Abierto</option>
            <option value="cerrado">Cerrado</option>
          </select>
        </div>
      </div>

      {err ? <p className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">{err}</p> : null}

      <ul className="space-y-3">
        {itemsPagina.map((r) => {
          const tituloLimpio = tituloEventoCard(r.titulo);
          return (
          <li key={r.id}>
            <div className="flex flex-col gap-4 rounded-xl border border-white/10 bg-[#141c28] p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 flex-1">
                <Link
                  href={`/admin/remates/${r.id}`}
                  className="inline-block text-base font-semibold text-white decoration-[#33C7E3]/50 underline-offset-2 hover:text-[#33C7E3] hover:underline"
                  title={tituloLimpio}
                >
                  {tituloLimpio}
                </Link>
                <p className="mt-1 text-xs text-neutral-500">Fin programado: {new Date(r.ends_at).toLocaleString("es-CL")}</p>
              </div>
              <div className="flex shrink-0 items-center gap-4 text-sm font-semibold text-white sm:px-3">
                <span>{etiquetaOrigenSimple(r.source_system)}</span>
                <span>{vehicleCountByRemate[r.id] ?? 0} vehículos</span>
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
          );
        })}
        {!itemsFiltrados.length ? (
          <p className="text-neutral-500">
            No hay {tipoVista === "venta_directa" ? "ventas directas" : "remates"} para el filtro seleccionado.
          </p>
        ) : null}
      </ul>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-neutral-400">
          Mostrando {itemsFiltrados.length === 0 ? 0 : inicio + 1}-
          {Math.min(inicio + PAGE_SIZE, itemsFiltrados.length)} de {itemsFiltrados.length}
        </p>
        <div className="inline-flex items-center gap-2">
          <button
            type="button"
            disabled={paginaSegura <= 1}
            onClick={() => setPaginaActual((p) => Math.max(1, p - 1))}
            className="rounded-lg border border-white/20 px-3 py-2 text-sm font-semibold text-white hover:bg-white/5 disabled:opacity-50"
          >
            Anterior
          </button>
          <span className="text-sm text-neutral-300">
            Página {paginaSegura} de {totalPaginas}
          </span>
          <button
            type="button"
            disabled={paginaSegura >= totalPaginas}
            onClick={() => setPaginaActual((p) => Math.min(totalPaginas, p + 1))}
            className="rounded-lg border border-white/20 px-3 py-2 text-sm font-semibold text-white hover:bg-white/5 disabled:opacity-50"
          >
            Siguiente
          </button>
        </div>
      </div>
    </div>
  );
}
