/** Ficha técnica desde fila Tasaciones Vedisa / inventario Supabase dinámico (similar detalle Rainworks). */

import type { InventarioRow } from "@/lib/portal-types";

export type InventarioSpecRow = {
  label: string;
  value: string;
  /** Clave canónica usada (solo depuración) */
  sourceKey?: string;
};

export type InventarioFichaSection = {
  title: string;
  description?: string;
  rows: InventarioSpecRow[];
};

/** Campos conocidos ordenados tipo listado público Vedisa ([vehículos chocados LotDetails](https://vehiculoschocados.cl/Event/LotDetails/11889124)). */
const ORDERED_GROUPS: readonly {
  title: string;
  description?: string;
  fields: readonly { label: string; keys: readonly string[] }[];
}[] = [
  {
    title: "Identificación del vehículo",
    fields: [
      { label: "Patente / PPU", keys: ["patente", "ppu", "PPU", "plate", "stock_number"] },
      { label: "Verificador patente / dígito", keys: ["patente_verifier", "verificador_patente", "digito_patente"] },
      { label: "Marca", keys: ["marca", "brand", "brand_name", "make"] },
      { label: "Tipo", keys: ["tipo", "tipo_vehiculo", "tipo_de_vehiculo", "clasificacion"] },
      { label: "Modelo", keys: ["modelo", "model", "nombre_modelo", "show_name", "showName", "original_model_name"] },
      { label: "Versión", keys: ["version", "trim", "ver", "nombre_version"] },
      { label: "Año", keys: ["ano", "anio", "year"] },
    ],
  },
  {
    title: "Aspecto y equipamiento principal",
    fields: [
      { label: "Color", keys: ["color", "color_exterior", "color_vehiculo", "exterior_color"] },
      { label: "Combustible", keys: ["combustible", "tipo_combustible", "fuel", "fuel_type"] },
      { label: "Cilindrada", keys: ["cilindrada", "cc", "motor_cc", "engine_cc"] },
      { label: "Kilometraje", keys: ["kilometraje", "km", "kms", "odometro", "mileage"] },
      { label: "Aro / rin", keys: ["aro", "arin", "rin", "rines", "wheel_size"] },
      { label: "Aire acondicionado", keys: ["aire_acondicionado", "aire_acondicionado_ac", "ac", "clima"] },
      { label: "Transmisión", keys: ["transmision", "transmisión", "caja", "tipo_caja", "gearbox"] },
      { label: "Tracción", keys: ["traccion", "tracción", "tipo_traccion", "drivetrain"] },
    ],
  },
  {
    title: "Estado y seguridad",
    fields: [
      { label: "Llaves", keys: ["llaves", "cantidad_llaves"] },
      { label: "Prueba básica motor", keys: ["prueba_basica_motor", "estado_motor", "motor_prueba_basica"] },
      {
        label: "Prueba básica desplazamiento",
        keys: ["prueba_basica_desplazamiento", "desplaza", "movilidad_desplaza"],
      },
      { label: "Estado airbags", keys: ["estado_airbags", "airbags", "condicion_airbags"] },
      {
        label: "Condición / estado declarado",
        keys: ["estado_general", "estado_auto", "estadoDeclarado", "condicion_general"],
      },
    ],
  },
  {
    title: "Propiedad y ubicación",
    fields: [
      { label: "Único propietario", keys: ["unico_propietario", "solo_propietario", "single_owner"] },
      {
        label: "Nombre propietario anterior",
        keys: ["nombre_propietario_anterior", "propietario_anterior_nombre"],
      },
      { label: "RUT propietario anterior", keys: ["rut_propietario_anterior"] },
      { label: "RUT verificador", keys: ["rut_verificador", "rut_verificado"] },
      {
        label: "Ubicación / bodega",
        keys: ["ubicacion", "sucursal", "ubicacion_retiro", "direccion", "bodega", "warehouse"],
      },
    ],
  },
  {
    title: "Permisos y documentación",
    fields: [
      {
        label: "Permiso de circulación vence",
        keys: ["permiso_circulacion_vence", "venc_permiso_circulacion", "Permiso_circulacion_vence"],
      },
      {
        label: "Revisión técnica / homologación vence",
        keys: ["rev_tecnica_vence", "revision_tecnica_vence", "homologacion_vence"],
      },
      {
        label: "Seguro obligatorio vence",
        keys: ["seguro_obligatorio_vence", "soap_vence", "venc_soap"],
      },
      { label: "Condicionado / restricciones", keys: ["condicionado"] },
      { label: "Siniestro", keys: ["siniestro", "id_siniestro", "claims_id"] },
    ],
  },
  {
    title: "Chasis y motor",
    fields: [
      { label: "N° VIN", keys: ["nro_vin", "vin", "numero_vin", "vehicle_vin", "NUMERO_DE_CHASIS"] },
      { label: "N° motor", keys: ["nro_motor", "numero_motor", "motor_numero", "n_motor"] },
    ],
  },
  {
    title: "Valoración y empresa (referencia Tasaciones)",
    fields: [
      { label: "Empresa / aseguradora", keys: ["empresa", "aseguradora", "companía", "insurer"] },
      {
        label: "Estado inventario Tasaciones",
        keys: ["estado", "estado_remate", "estado_retiro", "estado_vehículo"], // filtrar placeholders vacíos después
      },
      {
        label: "Categoría Tasaciones",
        keys: ["categoria", "categoría"],
      },
      { label: "Valor mínimo / referencia", keys: ["valor_minimo"] },
      { label: "Valor esperado Tasaciones", keys: ["valor_esperado"] },
    ],
  },
  {
    title: "Descripción extendida",
    fields: [{ label: "Descripción Tasaciones / observaciones", keys: ["descripcion", "observaciones"] }],
  },
];

const SKIP_VALUE_RE =
  /^(-|\.{2,}|n\/?a|no informa(no)?|s\/|s\/info|sin info|undefined|null)$/i;

function meaninglessString(s: string): boolean {
  const t = s.trim();
  if (!t) return true;
  return SKIP_VALUE_RE.test(t);
}

function absorbSpecArrays(row: Record<string, unknown>): Record<string, unknown> {
  const base: Record<string, unknown> = { ...row };
  const payloadCols = ["vehicle_specs", "technical_fields", "detalles", "campos_extra", "specifications"];

  for (const col of payloadCols) {
    const raw = row[col];
    if (!Array.isArray(raw)) continue;
    let i = 0;
    for (const entry of raw) {
      i += 1;
      if (!entry || typeof entry !== "object") continue;
      const e = entry as Record<string, unknown>;
      const labelCandidate =
        formatCellValue(e.label ?? e.nombre ?? e.key ?? e.campo ?? e.name ?? e.FieldName ?? e.Title) ??
        formatCellValue(e.description);
      const valueCandidate =
        formatCellValue(e.value ?? e.valor ?? e.val ?? e.texto ?? e.Content ?? e.Text ?? e.Description) ??
        formatCellValue(e.detail);
      if (!labelCandidate || !valueCandidate) continue;
      const nk = normalizeMapKey(labelCandidate).replace(/[^a-z0-9_]/g, "_").slice(0, 120);
      const key = nk.length ? nk : `campo_${i}_${col}`;
      if (!(key in base) && !buildNormKeyIndex(base).has(normalizeMapKey(key))) base[key] = valueCandidate;
    }
  }
  return base;
}

function buildNormKeyIndex(ob: Record<string, unknown>): Set<string> {
  const s = new Set<string>();
  for (const k of Object.keys(ob)) s.add(normalizeMapKey(k));
  return s;
}

/** Expande objetos hijo en claves tipo `campo_detalle`; conserva valores escalares superiores. */
export function expandInventarioRecord(row: Record<string, unknown>): Record<string, unknown> {
  const prepared = absorbSpecArrays(row);
  const out: Record<string, unknown> = {};
  const usedNorm = new Set<string>();

  const putNorm = (displayKey: string, val: unknown) => {
    const nk = normalizeMapKey(displayKey);
    if (usedNorm.has(nk)) return false;
    const formatted = formatCellValue(val);
    if (formatted === null) return false;
    usedNorm.add(nk);
    out[displayKey] = formatted;
    return true;
  };

  for (const [k, raw] of Object.entries(prepared)) {
    if (raw === null || raw === undefined) continue;

    if (
      typeof raw === "object" &&
      !Array.isArray(raw) &&
      !(raw instanceof Date) &&
      Object.keys(raw as object).length > 0 &&
      Object.keys(raw as object).length < 260
    ) {
      let anyChild = false;
      for (const [nk, nv] of Object.entries(raw as Record<string, unknown>)) {
        if (putNorm(`${k}_${nk}`, nv)) anyChild = true;
      }
      if (anyChild) continue;
    }

    putNorm(k, raw);
  }

  return out;
}

function normalizeMapKey(key: string): string {
  return key
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "_");
}

function lookupKey(map: Map<string, string>, wanted: readonly string[]): { key: string; value: string } | null {
  for (const alias of wanted) {
    const n = normalizeMapKey(alias);
    const raw = map.get(n);
    if (raw !== undefined && !meaninglessString(raw)) return { key: n, value: raw };
  }
  return null;
}

function buildLowerFlatMap(expanded: Record<string, unknown>): Map<string, string> {
  const map = new Map<string, string>();
  for (const [k0, v0] of Object.entries(expanded)) {
    const val = formatCellValue(v0);
    if (val === null) continue;
    const nk = normalizeMapKey(k0);
    if (!map.has(nk)) map.set(nk, val);
    /** Dynamo / Tasaciones suele usar `fields_marca`, `fields_ppu`, etc. */
    if (/^fields_/i.test(nk)) {
      const rest = nk.replace(/^fields_/, "").replace(/^field_/, "");
      if (rest && !map.has(rest)) map.set(rest, val);
    }
  }
  return map;
}

export function formatCellValue(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "boolean") return v ? "Sí" : "No";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : null;
  if (typeof v === "string") {
    const t = v.trim();
    if (meaninglessString(t)) return null;
    return t;
  }
  if (Array.isArray(v)) {
    const parts = v
      .map((x) => formatCellValue(x))
      .filter((x): x is string => x !== null);
    return parts.length ? parts.join(", ") : null;
  }
  if (typeof v === "object" && !(v instanceof Date)) {
    /** Objetos anidados raros: mostrar solo si es muy chico JSON */
    try {
      const s = JSON.stringify(v);
      return s.length < 480 ? s : null;
    } catch {
      return null;
    }
  }
  return null;
}

/** Claves por las que solo mostramos el valor textual (omitimos objeto crudo repetido si ya aplastamos hijos). */
const EXCLUDED_FROM_ADICIONALES = [
  /^id$/i,
  /^created_at$/i,
  /^updated_at$/i,
  /^imagen(es)?$/i,
  /^uuid$/i,
  /iframe|iframenova|glo3d|visor.?3|url.?3.?d/i,
  /thumbnail|thumb|photo|gallery|spin|embed.?url/i,
  /^password$/i,
  /^secret$/i,
];

function excludedFromAdicionalesKey(keyNorm: string, keyRaw: string): boolean {
  if (EXCLUDED_FROM_ADICIONALES.some((re) => re.test(keyRaw))) return true;
  if (/\b(src|iframe|thumbnail|gallery|photos|spin)\b/i.test(keyNorm)) return true;
  return false;
}

export type LotePortalContext = {
  id: string;
  orden?: number | null;
  titulo?: string | null;
  descripcion?: string | null;
  precio_base?: number | null;
  incremento_minimo?: number | null;
};

export type RematePortalContext = {
  id: string;
  titulo: string;
  starts_at?: string | null;
  ends_at?: string | null;
};

export function buildInventarioFichaSections(row: InventarioRow & Record<string, unknown>): InventarioFichaSection[] {
  const expanded = expandInventarioRecord(row);
  const flatMap = buildLowerFlatMap(expanded);

  /** Mapa campo mostrado (normalizado) → label legible ya usado en la ficha. */
  const consumedKeys = new Set<string>();

  const sections: InventarioFichaSection[] = [];

  for (const grp of ORDERED_GROUPS) {
    const rows: InventarioSpecRow[] = [];
    for (const fld of grp.fields) {
      const picked = lookupKey(flatMap, fld.keys);
      if (picked) {
        consumedKeys.add(picked.key);
        rows.push({ label: fld.label, value: picked.value, sourceKey: picked.key });
      }
    }
    if (rows.length) sections.push({ title: grp.title, description: grp.description, rows });
  }

  const adicionalRows: InventarioSpecRow[] = [];
  /** Valores únicos ya mostrados (evitar duplicar mismo texto desde otra clave). */
  const seenVals = new Set<string>();
  for (const sec of sections) {
    for (const r of sec.rows) seenVals.add(r.value.trim().toLowerCase());
  }

  for (const [kRaw, v] of Object.entries(expanded)) {
    const nk = normalizeMapKey(kRaw);
    if (consumedKeys.has(nk)) continue;
    if (excludedFromAdicionalesKey(nk, kRaw)) continue;
    const text = formatCellValue(v);
    if (text === null) continue;

    /** Evitar párrafos largos duplicados de descripción. */
    const valKey = text.trim().toLowerCase().slice(0, 280);
    if (seenVals.has(valKey)) continue;
    if (text.length > 4000) {
      adicionalRows.push({
        label: humanizeKeyDisplay(kRaw),
        value: text.slice(0, 4000) + "…",
        sourceKey: nk,
      });
    } else {
      adicionalRows.push({ label: humanizeKeyDisplay(kRaw), value: text, sourceKey: nk });
    }
    seenVals.add(valKey);
  }

  adicionalRows.sort((a, b) => a.label.localeCompare(b.label, "es"));

  if (adicionalRows.length) {
    sections.push({
      title: "Otros datos del sistema",
      description:
        "Campos adicionales informados por Tasaciones u orígenes de datos; la disponibilidad varía por registro.",
      rows: adicionalRows,
    });
  }

  return sections;
}

export function humanizeKeyDisplay(raw: string): string {
  return raw
    .replace(/__/g, " · ")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\w\S*/g, (t) => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase());
}

export type InventarioPortalLoteBanner = InventarioSpecRow[];

export function buildLotePortalRows(
  lote: LotePortalContext,
  remate: RematePortalContext,
  formatter: {
    fechaLarga(iso?: string | null): string | null;
    clp?(n?: number | null): string | null;
  },
): InventarioPortalLoteBanner {
  const out: InventarioSpecRow[] = [];
  const add = (label: string, value: unknown) => {
    const v = typeof value === "string" ? value.trim() : formatCellValue(value);
    if (v === null) return;
    if (meaninglessString(String(v))) return;
    out.push({ label, value: String(v) });
  };

  add("ID de sistema (portal)", lote.id);
  if (lote.orden != null) add("Posición / orden en remate", String(lote.orden));
  if (lote.titulo?.trim()) add("Título de lote (portal)", lote.titulo);
  add("Identificador de remate", remate.id);
  add("Remate", remate.titulo);
  const fin = formatter.fechaLarga(remate.ends_at);
  const ini = formatter.fechaLarga(remate.starts_at);
  if (fin) add("Fecha programada de cierre del remate", fin);
  if (ini) add("Inicio programado del remate", ini);
  if (lote.descripcion?.trim())
    add("Descripción complementaria del lote (portal)", lote.descripcion.trim());
  if (formatter.clp && lote.precio_base != null) add("Precio base publicado (portal)", formatter.clp(lote.precio_base) ?? "");
  if (formatter.clp && lote.incremento_minimo != null)
    add("Incremento mínimo de oferta (portal)", formatter.clp(lote.incremento_minimo) ?? "");
  return out;
}
