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
