/** Ficha técnica desde fila Tasaciones Vedisa / inventario Supabase dinámico (similar detalle Rainworks). */

import type { PortalInventarioFichaConfigV1 } from "@/lib/portal-ficha-config";
import { parsePortalInventarioFichaConfig } from "@/lib/portal-ficha-config";
import type { InventarioRow } from "@/lib/portal-types";
import { formatClp, tryParseMoneyInteger } from "@/lib/format-clp";

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
export const ORDERED_GROUPS: readonly {
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
      { label: "Valor mínimo / referencia", keys: ["valor_minimo"] },
      { label: "Valor esperado Tasaciones", keys: ["valor_esperado"] },
    ],
  },
  {
    title: "Descripción extendida",
    fields: [{ label: "Descripción Tasaciones / observaciones", keys: ["descripcion", "observaciones"] }],
  },
];

const OTROS_DATOS_SECTION_TITLE = "Otros datos del sistema";

/** Orden sugerido de bloques para el panel Personalizar + `sectionOrder` en Supabase. */
export function defaultFichaSectionOrderTitles(): readonly string[] {
  return [...ORDERED_GROUPS.map((g) => g.title), OTROS_DATOS_SECTION_TITLE];
}

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

export function normalizeMapKey(key: string): string {
  return key
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "_");
}

const MONEY_FIELD_KEYS_NORM: ReadonlySet<string> = (() => {
  const s = new Set<string>();
  function fieldIsMonetary(field: { label: string; keys: readonly string[] }): boolean {
    const lbl = field.label.toLowerCase();
    if (/\b(valor\s+m[ií]nimo|valor\s+esperado|precio\b|incremento\b|monto\b)/i.test(lbl)) return true;
    return field.keys.some((k) => /valor_(minimo|esperado)|precio_|incremento_|monto_/i.test(normalizeMapKey(k)));
  }
  for (const grp of ORDERED_GROUPS) {
    for (const fld of grp.fields) {
      if (!fieldIsMonetary(fld)) continue;
      for (const alias of fld.keys) s.add(normalizeMapKey(alias));
    }
  }
  return s;
})();

function isLikelyMoneyKeyNorm(nk: string): boolean {
  if (MONEY_FIELD_KEYS_NORM.has(nk)) return true;
  let rest = nk.replace(/^fields_/, "").replace(/^field_/, "");
  rest = rest.replace(/^fields_/, "").replace(/^field_/, "");
  if (MONEY_FIELD_KEYS_NORM.has(rest)) return true;
  return /(^|_)valor_(minimo|esperado|referencia)|precio_|(^|_)incremento|monto_|_clp_/i.test(nk);
}

function formatMoneyCellDisplayIfKey(nk: string, displayText: string): string {
  if (!isLikelyMoneyKeyNorm(nk)) return displayText;
  const n = tryParseMoneyInteger(displayText);
  return n !== null ? formatClp(n) : displayText;
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
    const shown = formatMoneyCellDisplayIfKey(nk, val);
    if (!map.has(nk)) map.set(nk, shown);
    /** Dynamo / Tasaciones suele usar `fields_marca`, `fields_ppu`, etc. */
    if (/^fields_/i.test(nk)) {
      const rest = nk.replace(/^fields_/, "").replace(/^field_/, "");
      if (rest && !map.has(rest)) map.set(rest, formatMoneyCellDisplayIfKey(rest, val));
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

const UUID_TAIL_RE = /\b[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b/i;

/** Evita etiquetas muy técnicas o valores puramente UUID en alcance empresa (p. ej. CIA SCOPE). */
function noisyAdicionalTechnicalRow(keyNorm: string, labelHuman: string, value: string): boolean {
  if (/cia_scope|_scope\b|enterprise_scope|compan(y|ia)_scope/i.test(keyNorm)) return true;
  if (/^empresa[:]/.test(value.trim()) && UUID_TAIL_RE.test(value)) return true;
  if (/^aws_campos_/i.test(keyNorm) && /cia\b|scope\b|uuid/i.test(labelHuman) && UUID_TAIL_RE.test(value)) return true;
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

/** Claves estables del bloque “Este lote en Vedisa Remates” (config admin). */
export const PORTAL_BANNER_KEYS = {
  LOTE_ID: "portal:lote:id",
  LOTE_ORDEN: "portal:lote:orden",
  LOTE_TITULO: "portal:lote:titulo",
  REMATE_ID: "portal:remate:id",
  REMATE_NOMBRE: "portal:remate:titulo",
  REMATE_CIERRA: "portal:remate:fecha_cierre",
  REMATE_INICIA: "portal:remate:fecha_inicio",
  LOTE_DESC: "portal:lote:descripcion_complementaria",
  LOTE_PRECIO_BASE: "portal:lote:precio_base",
  LOTE_INCREMENTO: "portal:lote:incremento_minimo",
} as const;

export type PortalBannerFieldAdminDef = {
  key: string;
  defaultLabel: string;
  /** Título en el panel administrador (sin códigos técnicos). */
  tituloEnPanel: string;
  ayudaParaAdmin: string;
  defaultOrder: number;
  hiddenByDefault: boolean;
};

export const PORTAL_BANNER_ADMIN_DEFS: readonly PortalBannerFieldAdminDef[] = [
  {
    key: PORTAL_BANNER_KEYS.LOTE_ID,
    defaultLabel: "ID de sistema",
    tituloEnPanel: "Código interno del lote",
    ayudaParaAdmin: "Solo sirve para equipos de soporte. En el sitio conviene mantenerlo oculto.",
    defaultOrder: 15,
    hiddenByDefault: true,
  },
  {
    key: PORTAL_BANNER_KEYS.LOTE_ORDEN,
    defaultLabel: "Posición / orden en remate",
    tituloEnPanel: "Número de orden dentro del catálogo del remate",
    ayudaParaAdmin: 'Es el orden en la lista administrativa ("lote 1, 2, 3"). Los visitantes no lo necesitan ver.',
    defaultOrder: 25,
    hiddenByDefault: true,
  },
  {
    key: PORTAL_BANNER_KEYS.LOTE_TITULO,
    defaultLabel: "Título del lote",
    tituloEnPanel: "Título destacado del lote",
    ayudaParaAdmin: 'Es el texto principal que ves en la ficha, por ejemplo marca y modelo combinados.',
    defaultOrder: 35,
    hiddenByDefault: false,
  },
  {
    key: PORTAL_BANNER_KEYS.REMATE_ID,
    defaultLabel: "Identificador del remate",
    tituloEnPanel: "Identificador interno del evento",
    ayudaParaAdmin: "Identificador de base de datos. No tiene valor público.",
    defaultOrder: 44,
    hiddenByDefault: true,
  },
  {
    key: PORTAL_BANNER_KEYS.REMATE_NOMBRE,
    defaultLabel: "Nombre del remate",
    tituloEnPanel: "Nombre del evento de remate",
    ayudaParaAdmin: 'Si ya aparece arriba en la página suele estar de más repetirlo; podés ocultarlo.',
    defaultOrder: 48,
    hiddenByDefault: true,
  },
  {
    key: PORTAL_BANNER_KEYS.REMATE_CIERRA,
    defaultLabel: "Fecha de cierre programada",
    tituloEnPanel: "¿Cuándo cierra?",
    ayudaParaAdmin: "Momento público más importante junto al precio base.",
    defaultOrder: 110,
    hiddenByDefault: false,
  },
  {
    key: PORTAL_BANNER_KEYS.REMATE_INICIA,
    defaultLabel: "Inicio programado del remate",
    tituloEnPanel: "¿Cuándo parte?",
    ayudaParaAdmin: "Útil si querés destacar también la fecha de comienzo del evento.",
    defaultOrder: 105,
    hiddenByDefault: false,
  },
  {
    key: PORTAL_BANNER_KEYS.LOTE_DESC,
    defaultLabel: "Descripción complementaria del lote",
    tituloEnPanel: "Texto aclaratorio sobre el lote",
    ayudaParaAdmin: "Descripción opcional cargada desde el portal para este lote.",
    defaultOrder: 165,
    hiddenByDefault: false,
  },
  {
    key: PORTAL_BANNER_KEYS.LOTE_PRECIO_BASE,
    defaultLabel: "Precio base publicado",
    tituloEnPanel: "Precio de partida visible",
    ayudaParaAdmin: "Valor que ve el público como base para ofertar.",
    defaultOrder: 220,
    hiddenByDefault: false,
  },
  {
    key: PORTAL_BANNER_KEYS.LOTE_INCREMENTO,
    defaultLabel: "Incremento mínimo de oferta",
    tituloEnPanel: "Pasos entre ofertas (mínimo)",
    ayudaParaAdmin: "Ayuda al comprador a entender de cuánto en cuánto conviene aumentar cada oferta.",
    defaultOrder: 230,
    hiddenByDefault: false,
  },
];

/** Banner: filas que no se muestran en sala ni tienen opción en el panel (solo existen como datos fuente). */
export const PORTAL_BANNER_KEYS_NEVER_PUBLIC = new Set<string>([
  PORTAL_BANNER_KEYS.LOTE_ID,
  PORTAL_BANNER_KEYS.LOTE_ORDEN,
  PORTAL_BANNER_KEYS.REMATE_ID,
]);

/** Definiciones configurables para el panel (“tarjeta de precio y fechas”). */
export const PORTAL_BANNER_ADMIN_PANEL_DEFS = PORTAL_BANNER_ADMIN_DEFS.filter(
  (d) => !PORTAL_BANNER_KEYS_NEVER_PUBLIC.has(d.key),
);

const DEFAULT_PORTAL_BANNER_HIDDEN = new Set<string>(
  PORTAL_BANNER_ADMIN_DEFS.filter((d) => d.hiddenByDefault).map((d) => d.key),
);

const PORTAL_BANNER_DEFAULT_ORDER: Record<string, number> = Object.fromEntries(
  PORTAL_BANNER_ADMIN_DEFS.map((d) => [d.key, d.defaultOrder]),
);

function buildDefaultSourceKeyOrder(): Map<string, number> {
  const m = new Map<string, number>();
  let g = 0;
  for (const grp of ORDERED_GROUPS) {
    let f = 0;
    for (const fld of grp.fields) {
      const ordBase = g * 10_000 + f * 10;
      for (const alias of fld.keys) {
        const nk = normalizeMapKey(alias);
        if (!m.has(nk)) m.set(nk, ordBase);
      }
      f += 1;
    }
    g += 1;
  }
  return m;
}

const DEFAULT_SOURCE_KEY_ORDER = buildDefaultSourceKeyOrder();

function compareSectionTitles(a: string, b: string, preset: readonly string[]): number {
  const ia = preset.indexOf(a);
  const ib = preset.indexOf(b);
  const ra = ia === -1 ? 1_000_000 : ia;
  const rb = ib === -1 ? 1_000_000 : ib;
  if (ra !== rb) return ra - rb;
  return a.localeCompare(b, "es");
}

export function collectAdminInventoryPresetRows(): readonly {
  sourceKeyHint: string;
  aliases: readonly string[];
  sectionTitle: string;
  defaultLabel: string;
}[] {
  const out: {
    sourceKeyHint: string;
    aliases: readonly string[];
    sectionTitle: string;
    defaultLabel: string;
  }[] = [];
  for (const grp of ORDERED_GROUPS) {
    for (const fld of grp.fields) {
      const aliases = fld.keys.map((k) => normalizeMapKey(k));
      const sourceKeyHint = aliases[0] ?? "";
      if (!sourceKeyHint) continue;
      out.push({ sourceKeyHint, aliases, sectionTitle: grp.title, defaultLabel: fld.label });
    }
  }
  return out;
}

export function applyFichaPublicConfig(
  sections: InventarioFichaSection[],
  portalRows: InventarioSpecRow[],
  rawConfig?: unknown | null,
): { sections: InventarioFichaSection[]; portalRows: InventarioSpecRow[] } {
  const parsed = parsePortalInventarioFichaConfig(rawConfig ?? null);
  const cfg: PortalInventarioFichaConfigV1 = parsed ?? { version: 1 };
  const overrides = cfg.fieldOverrides ?? {};
  const sectionPreset = cfg.sectionOrder ?? [];

  const portalHidden = new Set(DEFAULT_PORTAL_BANNER_HIDDEN);
  for (const k of cfg.portalBannerHiddenKeys ?? []) {
    if (k.trim()) portalHidden.add(k.trim());
  }

  type PortalPrep = { row: InventarioSpecRow; ord: number };
  const portalPrep: PortalPrep[] = [];
  for (const r of portalRows) {
    const sk = r.sourceKey?.trim();
    if (!sk) continue;
    if (PORTAL_BANNER_KEYS_NEVER_PUBLIC.has(sk)) continue;
    const ov = overrides[sk];
    if (ov?.visible === false) continue;
    if (ov?.visible !== true && portalHidden.has(sk)) continue;
    const label = typeof ov?.label === "string" && ov.label.trim() ? ov.label.trim() : r.label;
    const ord =
      typeof ov?.order === "number" && Number.isFinite(ov.order) ? ov.order : (PORTAL_BANNER_DEFAULT_ORDER[sk] ?? 500);
    portalPrep.push({ row: { label, value: r.value, sourceKey: sk }, ord });
  }
  portalPrep.sort((a, b) => {
    if (a.ord !== b.ord) return a.ord - b.ord;
    return a.row.label.localeCompare(b.row.label, "es");
  });
  const portalOut = portalPrep.map((p) => p.row);

  const descByTitle = new Map<string, string | undefined>();
  for (const sec of sections) descByTitle.set(sec.title, sec.description);

  type InvPrep = { row: InventarioSpecRow; ord: number; sectionTitle: string };
  const inventoryPrep: InvPrep[] = [];
  for (const sec of sections) {
    for (const row of sec.rows) {
      const sk = row.sourceKey?.trim();
      if (!sk) continue;
      const ov = overrides[sk];
      if (ov?.visible === false) continue;
      const label = typeof ov?.label === "string" && ov.label.trim() ? ov.label.trim() : row.label;
      const sectionTitle =
        typeof ov?.sectionTitle === "string" && ov.sectionTitle.trim() ? ov.sectionTitle.trim() : sec.title;
      const baseOrd = DEFAULT_SOURCE_KEY_ORDER.get(sk) ?? 8_000_000 + sk.charCodeAt(0) + sk.length;
      const ord = typeof ov?.order === "number" && Number.isFinite(ov.order) ? ov.order : baseOrd;
      inventoryPrep.push({ row: { label, value: row.value, sourceKey: sk }, ord, sectionTitle });
    }
  }

  const bySec = new Map<string, InvPrep[]>();
  for (const p of inventoryPrep) {
    const list = bySec.get(p.sectionTitle) ?? [];
    list.push(p);
    bySec.set(p.sectionTitle, list);
  }

  const secTitles = [...bySec.keys()].sort((a, b) => compareSectionTitles(a, b, sectionPreset));
  const hiddenSecs = new Set((cfg.hiddenSectionTitles ?? []).map((s) => s.trim()).filter(Boolean));
  const sectionsOut: InventarioFichaSection[] = [];
  for (const title of secTitles) {
    if (hiddenSecs.has(title)) continue;
    const list = bySec.get(title);
    if (!list?.length) continue;
    list.sort((a, b) => {
      if (a.ord !== b.ord) return a.ord - b.ord;
      return a.row.label.localeCompare(b.row.label, "es");
    });
    sectionsOut.push({
      title,
      description: descByTitle.get(title),
      rows: list.map((p) => p.row),
    });
  }

  return { sections: sectionsOut, portalRows: portalOut };
}

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

    const shown = formatMoneyCellDisplayIfKey(nk, text);

    /** Evitar párrafos largos duplicados de descripción. */
    const valKey = shown.trim().toLowerCase().slice(0, 280);
    if (seenVals.has(valKey)) continue;
    const hum = humanizeKeyDisplay(kRaw);
    if (noisyAdicionalTechnicalRow(nk, hum, text)) continue;
    if (shown.length > 4000) {
      adicionalRows.push({
        label: hum,
        value: shown.slice(0, 4000) + "…",
        sourceKey: nk,
      });
    } else {
      adicionalRows.push({ label: hum, value: shown, sourceKey: nk });
    }
    seenVals.add(valKey);
  }

  adicionalRows.sort((a, b) => a.label.localeCompare(b.label, "es"));

  if (adicionalRows.length) {
    sections.push({
      title: OTROS_DATOS_SECTION_TITLE,
      description:
        "Información técnica o comercial adicional según el origen del registro; disponibilidad y etiquetas pueden variar por vehículo.",
      rows: adicionalRows,
    });
  }

  return sections;
}

export function humanizeKeyDisplay(raw: string): string {
  let nk = normalizeMapKey(raw);
  nk = nk
    .replace(/^aws_campos_fields?_?/, "")
    .replace(/^aws_campos_/, "")
    .replace(/^aws_/, "")
    .replace(/^fields?_?/, "")
    .replace(/^campos?_?/, "");
  nk = nk.replace(/^fields?_?/, "");
  nk = nk.replace(/_+/g, "_");

  let s = nk.replace(/__/g, " · ").replace(/_/g, " ").replace(/\s+/g, " ").trim();
  if (!s.length) return raw.replace(/_/g, " ").trim();
  return s.replace(/\w\S*/g, (t) => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase());
}

export type InventarioPortalLoteBanner = InventarioSpecRow[];

function portalBannerDefaultLabel(portalRowKey: string): string {
  return PORTAL_BANNER_ADMIN_DEFS.find((d) => d.key === portalRowKey)?.defaultLabel ?? portalRowKey;
}

export function buildLotePortalRows(
  lote: LotePortalContext,
  remate: RematePortalContext,
  formatter: {
    fechaLarga(iso?: string | null): string | null;
    clp?(n?: number | null): string | null;
  },
): InventarioPortalLoteBanner {
  const out: InventarioSpecRow[] = [];
  const addRow = (portalRowKey: string, value: unknown) => {
    const v = typeof value === "string" ? value.trim() : formatCellValue(value);
    if (v === null) return;
    if (meaninglessString(String(v))) return;
    const label = portalBannerDefaultLabel(portalRowKey);
    out.push({ label, value: String(v), sourceKey: portalRowKey });
  };

  addRow(PORTAL_BANNER_KEYS.LOTE_ID, lote.id);
  if (lote.orden != null) addRow(PORTAL_BANNER_KEYS.LOTE_ORDEN, String(lote.orden));
  if (lote.titulo?.trim()) addRow(PORTAL_BANNER_KEYS.LOTE_TITULO, lote.titulo.trim());
  addRow(PORTAL_BANNER_KEYS.REMATE_ID, remate.id);
  addRow(PORTAL_BANNER_KEYS.REMATE_NOMBRE, remate.titulo);
  const fin = formatter.fechaLarga(remate.ends_at);
  const ini = formatter.fechaLarga(remate.starts_at);
  if (fin) addRow(PORTAL_BANNER_KEYS.REMATE_CIERRA, fin);
  if (ini) addRow(PORTAL_BANNER_KEYS.REMATE_INICIA, ini);
  if (lote.descripcion?.trim()) addRow(PORTAL_BANNER_KEYS.LOTE_DESC, lote.descripcion.trim());
  if (formatter.clp && lote.precio_base != null) {
    addRow(PORTAL_BANNER_KEYS.LOTE_PRECIO_BASE, formatter.clp(lote.precio_base) ?? "");
  }
  if (formatter.clp && lote.incremento_minimo != null) {
    addRow(PORTAL_BANNER_KEYS.LOTE_INCREMENTO, formatter.clp(lote.incremento_minimo) ?? "");
  }

  out.sort((a, b) => {
    const oa = PORTAL_BANNER_DEFAULT_ORDER[a.sourceKey ?? ""] ?? 500;
    const ob = PORTAL_BANNER_DEFAULT_ORDER[b.sourceKey ?? ""] ?? 500;
    if (oa !== ob) return oa - ob;
    return a.label.localeCompare(b.label, "es");
  });
  return out;
}
