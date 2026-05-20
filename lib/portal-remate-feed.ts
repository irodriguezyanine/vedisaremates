import type { PortalRemateRow } from "@/lib/portal-types";

/** Cómo clasificar un remate público para el feed del home (tabs actuales / próximas / cerradas). */
export type RemateFeedSlice = "actual" | "proxima" | "cerrada";

export function classifyRemateForFeed(r: PortalRemateRow): RemateFeedSlice {
  const now = Date.now();
  const endMs = new Date(r.ends_at).getTime();
  const startMs = r.starts_at ? new Date(r.starts_at).getTime() : null;

  if (Number.isNaN(endMs)) return "cerrada";

  if (r.estado === "cerrado" || endMs < now) return "cerrada";

  if (r.estado === "en_curso") return "actual";

  if (r.estado === "publicado") {
    if (startMs != null && !Number.isNaN(startMs) && now < startMs) return "proxima";
    return endMs >= now ? "actual" : "cerrada";
  }

  return "cerrada";
}

/** Ventana para distinguir «próximo» (cerca) vs «futuro» (más adelante) en remates publicados sin iniciar. */
const REMATE_PROXIMO_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

export type RemateSalaSection = "actuales" | "proximos" | "futuros" | "cerrados";

export const REMATE_SALA_SECTIONS: {
  key: RemateSalaSection;
  title: string;
  empty: string;
}[] = [
  { key: "actuales", title: "Remates actuales", empty: "No hay remates en curso en este momento." },
  { key: "proximos", title: "Remates próximos", empty: "No hay remates próximos publicados." },
  { key: "futuros", title: "Remates futuros", empty: "No hay remates futuros publicados." },
  { key: "cerrados", title: "Remates cerrados", empty: "Todavía no hay remates cerrados para mostrar." },
];

export function classifyRemateForSala(r: PortalRemateRow): RemateSalaSection {
  const slice = classifyRemateForFeed(r);
  if (slice === "actual") return "actuales";
  if (slice === "cerrada") return "cerrados";

  const now = Date.now();
  const startMs = r.starts_at ? new Date(r.starts_at).getTime() : null;
  if (startMs != null && !Number.isNaN(startMs) && startMs - now > REMATE_PROXIMO_WINDOW_MS) {
    return "futuros";
  }
  return "proximos";
}

export function formatRemateScheduleCompact(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function rematePublicStatusLabel(section: RemateSalaSection): "Abierto" | "Próximo" | "Futuro" | "Cerrado" {
  if (section === "actuales") return "Abierto";
  if (section === "proximos") return "Próximo";
  if (section === "futuros") return "Futuro";
  return "Cerrado";
}

export function rematePublicStatusBadgeClass(section: RemateSalaSection): string {
  if (section === "actuales") {
    return "bg-emerald-600 text-white ring-2 ring-emerald-500/25";
  }
  if (section === "proximos") {
    return "bg-sky-600 text-white ring-2 ring-sky-400/40";
  }
  if (section === "futuros") {
    return "bg-indigo-600 text-white ring-2 ring-indigo-400/35";
  }
  return "bg-neutral-500 text-white";
}

export function groupRematesBySalaSection(rows: PortalRemateRow[]): Record<RemateSalaSection, PortalRemateRow[]> {
  const groups: Record<RemateSalaSection, PortalRemateRow[]> = {
    actuales: [],
    proximos: [],
    futuros: [],
    cerrados: [],
  };
  for (const row of rows) {
    groups[classifyRemateForSala(row)].push(row);
  }
  return groups;
}

export function countdownLabelFromEndsAt(endsAt: string): string | null {
  const endMs = new Date(endsAt).getTime();
  if (Number.isNaN(endMs)) return null;
  const delta = Math.max(0, endMs - Date.now());
  const totalSec = Math.floor(delta / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = Math.floor(totalSec % 60);

  if (days > 0) {
    return `${days}d ${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m`;
  }
  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
  }
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}
