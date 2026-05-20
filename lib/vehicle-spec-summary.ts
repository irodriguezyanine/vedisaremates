import type { InventarioRow } from "@/lib/portal-types";

export type SpecIconName =
  | "km"
  | "year"
  | "fuel"
  | "gear"
  | "engineTest"
  | "movementTest"
  | "conditioned"
  | "singleOwner"
  | "airConditioning"
  | "keys"
  | "traction"
  | "airbags";

export type VehicleSpec = {
  key: string;
  label: string;
  icon: SpecIconName;
  wide?: boolean;
};

type InventarioAnyRow = InventarioRow & Record<string, unknown>;

type RawEntry = {
  key: string;
  path: string;
  value: unknown;
};

function normalizeKeyToken(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[\s\-.]+/g, "_")
    .trim();
}

function collectRawEntries(input: unknown, parentPath = ""): RawEntry[] {
  if (!input || typeof input !== "object" || Array.isArray(input)) return [];
  const source = input as Record<string, unknown>;
  const entries: RawEntry[] = [];
  for (const [rawKey, rawValue] of Object.entries(source)) {
    const key = normalizeKeyToken(rawKey);
    const path = parentPath ? `${parentPath}.${key}` : key;
    entries.push({ key, path, value: rawValue });
    if (rawValue && typeof rawValue === "object" && !Array.isArray(rawValue)) {
      entries.push(...collectRawEntries(rawValue, path));
    }
  }
  return entries;
}

function asDisplayValue(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "si" : "no";
  return null;
}

function getFirstRawValue(entries: RawEntry[], keys: string[]): string | null {
  const normalizedKeys = keys.map((key) => normalizeKeyToken(key));
  for (const alias of normalizedKeys) {
    const exact = entries.find((entry) => entry.path === alias || entry.key === alias);
    const exactValue = asDisplayValue(exact?.value);
    if (exactValue) return exactValue;
    const contains = entries.find((entry) => entry.path.includes(alias) || alias.includes(entry.key));
    const containsValue = asDisplayValue(contains?.value);
    if (containsValue) return containsValue;
  }
  return null;
}

function normalizeBinaryStatus(value: string | null): "yes" | "no" | "unknown" | null {
  if (!value) return null;
  const normalized = value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (!normalized) return null;
  if (["si", "yes", "true", "1", "arranca", "se mueve", "se desplaza"].includes(normalized)) return "yes";
  if (["no", "false", "0", "no arranca", "no se mueve", "no se desplaza"].includes(normalized)) return "no";
  return "unknown";
}

function getMotorTestLabel(value: string | null): string | null {
  const status = normalizeBinaryStatus(value);
  if (!status) return null;
  if (status === "yes") return "MOTOR ARRANCA";
  if (status === "no") return "MOTOR NO ARRANCA";
  return value?.trim().toUpperCase() ?? null;
}

function getMovementTestLabel(value: string | null): string | null {
  const status = normalizeBinaryStatus(value);
  if (!status) return null;
  if (status === "yes") return "SE DESPLAZA";
  if (status === "no") return "NO SE DESPLAZA";
  return value?.trim().toUpperCase() ?? null;
}

/** Lee un campo del inventario por alias (incluye campos anidados). */
export function getInventarioField(row: InventarioAnyRow, keys: string[]): string | null {
  return getFirstRawValue(collectRawEntries(row as Record<string, unknown>), keys);
}

function statusLabel(value: string | null, opts: { yes: string; no?: string }): string | null {
  if (!value) return null;
  const status = normalizeBinaryStatus(value);
  if (status === "yes") return opts.yes;
  if (status === "no") return opts.no ?? `SIN ${opts.yes}`;
  const cleaned = value.trim();
  return cleaned ? cleaned.toUpperCase() : null;
}

function normalizeMileage(value: string | null): string | null {
  if (!value) return null;
  const compact = value.trim();
  if (!compact) return null;
  const digits = compact.replace(/[^\d]/g, "");
  if (!digits) return compact;
  return `${Number(digits).toLocaleString("es-CL")} kms.`;
}

/** Especificaciones visuales del vehículo (misma lógica que tarjetas del home). */
export function getVehicleSpecs(row: InventarioAnyRow): VehicleSpec[] {
  const raw = row as Record<string, unknown>;
  const entries = collectRawEntries(raw);
  const mileage = normalizeMileage(
    getFirstRawValue(entries, ["kilometraje", "km", "kms", "odometro", "odómetro", "glo3d.kilometraje", "odometro_actual"]),
  );
  const year = getFirstRawValue(entries, ["ano", "anio", "year", "glo3d.year"]);
  const fuel = getFirstRawValue(entries, ["combustible", "fuel", "glo3d.combustible", "tipo_combustible"]);
  const transmission = getFirstRawValue(entries, [
    "transmision",
    "transmisión",
    "caja",
    "transmission",
    "glo3d.transmision",
    "tipo_caja",
  ]);
  const motorTestRaw = getFirstRawValue(entries, [
    "prueba_motor",
    "pdm",
    "pruebaMotor",
    "motor_test",
    "glo3d.prueba_motor",
    "motor_arranca",
    "arranca",
    "motor_funciona",
  ]);
  const movementTestRaw = getFirstRawValue(entries, [
    "prueba_desplazamiento",
    "pdd",
    "pruebaDesplazamiento",
    "movement_test",
    "glo3d.prueba_desplazamiento",
    "se_desplaza",
    "desplaza",
    "movimiento",
  ]);
  const conditionedRaw = getFirstRawValue(entries, ["condicionado", "glo3d.condicionado", "acondicionado"]);
  const singleOwnerRaw = getFirstRawValue(entries, [
    "unico_propietario",
    "single_owner",
    "one_owner",
    "glo3d.unico_propietario",
    "duenos",
    "dueno_unico",
  ]);
  const airConditioningRaw = getFirstRawValue(entries, [
    "aire_acondicionado",
    "air_conditioning",
    "has_ac",
    "ac",
    "glo3d.aire_acondicionado",
    "aire",
  ]);
  const keysRaw = getFirstRawValue(entries, [
    "llaves",
    "keys",
    "has_keys",
    "tiene_llaves",
    "glo3d.llaves",
    "con_llaves",
    "cantidad_llaves",
  ]);
  const tractionRaw = getFirstRawValue(entries, ["traccion", "traction", "glo3d.traccion", "traccion_4x4", "4x4"]);
  const airbagsRaw = getFirstRawValue(entries, ["estado_airbags", "airbags", "eda", "glo3d.estado_airbags", "airbag"]);
  const motorTest = getMotorTestLabel(motorTestRaw);
  const movementTest = getMovementTestLabel(movementTestRaw);
  const conditioned = statusLabel(conditionedRaw, { yes: "ACONDICIONADO", no: "NO ACONDICIONADO" });
  const singleOwner = statusLabel(singleOwnerRaw, { yes: "UNICO DUEÑO", no: "MULTIPLES DUEÑOS" });
  const airConditioning = statusLabel(airConditioningRaw, { yes: "AIRE ACONDICIONADO", no: "SIN AIRE ACONDICIONADO" });
  const keys = statusLabel(keysRaw, { yes: "CON LLAVES", no: "SIN LLAVES" });

  const specs: VehicleSpec[] = [];
  if (mileage) specs.push({ key: "km", label: mileage, icon: "km" });
  if (year) specs.push({ key: "year", label: year, icon: "year" });
  if (fuel) specs.push({ key: "fuel", label: fuel.toUpperCase(), icon: "fuel" });
  if (transmission) specs.push({ key: "gear", label: transmission.toUpperCase(), icon: "gear" });
  if (motorTest) specs.push({ key: "engineTest", label: motorTest, icon: "engineTest", wide: true });
  if (movementTest) specs.push({ key: "movementTest", label: movementTest, icon: "movementTest", wide: true });
  if (conditioned) specs.push({ key: "conditioned", label: conditioned, icon: "conditioned", wide: true });
  if (singleOwner) specs.push({ key: "singleOwner", label: singleOwner, icon: "singleOwner", wide: true });
  if (airConditioning) specs.push({ key: "airConditioning", label: airConditioning, icon: "airConditioning", wide: true });
  if (keys) specs.push({ key: "keys", label: keys, icon: "keys", wide: true });
  if (tractionRaw) specs.push({ key: "traction", label: `TRACCION ${tractionRaw.toUpperCase()}`, icon: "traction", wide: true });
  if (airbagsRaw) specs.push({ key: "airbags", label: `AIRBAGS: ${airbagsRaw.toUpperCase()}`, icon: "airbags", wide: true });
  return specs.slice(0, 12);
}

export function vehicleSummaryTitle(row: InventarioAnyRow): string {
  const patente = String(row.patente ?? "").trim();
  const marca = String(row.marca ?? "").trim();
  const modelo = String(row.modelo ?? "").trim();
  const ano = String(row.ano ?? row.anio ?? "").trim();
  const core = [marca, modelo, ano].filter(Boolean).join(" ");
  if (patente && core) return `${patente} · ${core}`;
  if (patente) return patente;
  return core || "Vehículo en remate";
}
