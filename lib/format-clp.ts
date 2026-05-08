/** Pesos chilenos en UI: símbolo $, miles con punto (es-CL), sin sufijo «CLP». */

export const grupoMilesEsClFmt = new Intl.NumberFormat("es-CL", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export function formatClp(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "—";
  return `$${grupoMilesEsClFmt.format(Math.round(Number(n)))}`;
}

/** Solo agrupación de miles es-CL (sin $), ej. kilometraje. */
export function formatThousandsEsClInteger(n: number): string {
  return grupoMilesEsClFmt.format(Math.round(n));
}

/**
 * Interpreta texto o número como entero en pesos (acepta "4088889", "4.088.889", "$ 4088889").
 */
export function tryParseMoneyInteger(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.round(raw);
  if (typeof raw !== "string") return null;
  let t = raw.trim().replace(/\$/g, "").replace(/\s/g, "");
  if (!t) return null;
  if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
  else t = t.replace(/\./g, "");
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
