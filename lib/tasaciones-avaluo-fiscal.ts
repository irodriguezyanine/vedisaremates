import { tryParseMoneyInteger } from "@/lib/format-clp";

/** Rango plausible de avalúo fiscal vehicular en CLP. */
export function isPlausibleAvaluoFiscalMonto(amount: number): boolean {
  return Number.isFinite(amount) && amount >= 100_000 && amount <= 300_000_000;
}

export function parseAvaluoFiscalMonto(value: unknown): number | null {
  const parsed =
    typeof value === "number" && Number.isFinite(value)
      ? Math.round(value)
      : tryParseMoneyInteger(value);
  if (parsed == null || !isPlausibleAvaluoFiscalMonto(parsed)) return null;
  return parsed;
}

/** Tasaciones Remates → Propietario y valorización → extra_fields.avaluo_fiscal_monto */
export function readAvaluoFromRemateItemExtra(extraFields: unknown): number | null {
  if (!extraFields || typeof extraFields !== "object") return null;
  const row = extraFields as Record<string, unknown>;
  return parseAvaluoFiscalMonto(row.avaluo_fiscal_monto);
}

/** Tasaciones Inventario → Gestión comercial → inventario.avaluo_fiscal_monto */
export function readAvaluoFromInventario(inventario: Record<string, unknown> | null | undefined): number | null {
  if (!inventario) return null;
  return parseAvaluoFiscalMonto(inventario.avaluo_fiscal_monto);
}

/**
 * 1) Remate item (Propietario y valorización)
 * 2) Inventario (Avalúo fiscal tasación)
 */
export function resolveAvaluoFiscalMonto(input: {
  remateItemExtraFields?: unknown;
  inventario?: Record<string, unknown> | null;
}): number | null {
  const fromRemate = readAvaluoFromRemateItemExtra(input.remateItemExtraFields);
  if (fromRemate != null) return fromRemate;
  return readAvaluoFromInventario(input.inventario);
}
