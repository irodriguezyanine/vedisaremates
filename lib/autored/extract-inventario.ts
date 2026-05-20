import type { InventarioRow } from "@/lib/portal-types";
import { getInventarioField } from "@/lib/vehicle-spec-summary";

type InventarioAnyRow = InventarioRow & Record<string, unknown>;

export function normalizarPatenteParaAutored(raw: string): string {
  return (raw ?? "").replace(/[\s.\-·]/g, "").toUpperCase();
}

export function extraerKilometrajeNumerico(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const digits = String(raw).replace(/[^\d]/g, "");
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Patente, versión y km del inventario para consultar Autored. */
export function extraerCamposAutoredInventario(inventario: InventarioAnyRow): {
  patente: string;
  version: string | null;
  kilometraje: string | null;
  kilometrajeNum: number | null;
} {
  const patente = normalizarPatenteParaAutored(String(inventario.patente ?? ""));
  const version =
    String(inventario.version ?? "").trim() ||
    getInventarioField(inventario, ["version", "ver", "trim", "glo3d.version"]) ||
    null;
  const kilometraje =
    String(inventario.kilometraje ?? "").trim() ||
    getInventarioField(inventario, ["kilometraje", "km", "kms", "odometro", "odómetro", "glo3d.kilometraje", "mileage"]) ||
    null;
  return {
    patente,
    version,
    kilometraje,
    kilometrajeNum: extraerKilometrajeNumerico(kilometraje),
  };
}
