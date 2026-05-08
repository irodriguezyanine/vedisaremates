/** Config persistente Supabase (`portal_inventario_ficha_config`) para etiquetas / visibilidad / orden en ficha inventario-subasta. */

export type PortalFichaFieldOverride = {
  label?: string;
  visible?: boolean;
  order?: number;
  /** Sobrescribe el título del bloque (agrupación tipo catálogo). */
  sectionTitle?: string | null;
};

export type PortalInventarioFichaConfigV1 = {
  version: 1;
  fieldOverrides?: Record<string, PortalFichaFieldOverride>;
  /** Primero estos títulos de sección en este orden; el resto alfabético. */
  sectionOrder?: string[];
  /** Ocultación extra para filas banner portal (clave estable `portal:lote:id`, etc.). */
  portalBannerHiddenKeys?: string[];
  /** Bloques de inventario (`Identificación…`, `Otros datos…`) que no se muestran en la web */
  hiddenSectionTitles?: string[];
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function sanitizeOverride(raw: Record<string, unknown>): PortalFichaFieldOverride | null {
  const o: PortalFichaFieldOverride = {};
  if (typeof raw.label === "string") {
    const t = raw.label.trim().slice(0, 320);
    if (t.length) o.label = t;
  }
  if (typeof raw.visible === "boolean") o.visible = raw.visible;
  if (typeof raw.order === "number" && Number.isFinite(raw.order)) o.order = Math.round(raw.order);
  if (raw.sectionTitle === null) {
    o.sectionTitle = null;
  } else if (typeof raw.sectionTitle === "string") {
    const st = raw.sectionTitle.trim().slice(0, 240);
    o.sectionTitle = st.length ? st : null;
  }
  return Object.keys(o).length ? o : null;
}

export function parsePortalInventarioFichaConfig(raw: unknown): PortalInventarioFichaConfigV1 | null {
  if (!isPlainObject(raw)) return null;
  const ver = raw.version;
  if (ver !== 1) return null;

  let fieldOverrides: Record<string, PortalFichaFieldOverride> | undefined;
  if (raw.fieldOverrides !== undefined && isPlainObject(raw.fieldOverrides)) {
    fieldOverrides = {};
    for (const [k, v] of Object.entries(raw.fieldOverrides)) {
      if (!k.trim() || !isPlainObject(v)) continue;
      const sanitized = sanitizeOverride(v);
      if (sanitized) fieldOverrides[k.trim()] = sanitized;
    }
    if (!Object.keys(fieldOverrides).length) fieldOverrides = undefined;
  }

  let sectionOrder: string[] | undefined;
  if (Array.isArray(raw.sectionOrder)) {
    sectionOrder = raw.sectionOrder.filter((x) => typeof x === "string").map((s) => s.trim()).filter(Boolean).slice(0, 128);
    if (!sectionOrder.length) sectionOrder = undefined;
  }

  let portalBannerHiddenKeys: string[] | undefined;
  if (Array.isArray(raw.portalBannerHiddenKeys)) {
    portalBannerHiddenKeys = raw.portalBannerHiddenKeys
      .filter((x) => typeof x === "string")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 96);
    if (!portalBannerHiddenKeys.length) portalBannerHiddenKeys = undefined;
  }

  let hiddenSectionTitles: string[] | undefined;
  if (Array.isArray(raw.hiddenSectionTitles)) {
    hiddenSectionTitles = raw.hiddenSectionTitles
      .filter((x) => typeof x === "string")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 96);
    if (!hiddenSectionTitles.length) hiddenSectionTitles = undefined;
  }

  const out: PortalInventarioFichaConfigV1 = { version: 1 };
  if (fieldOverrides) out.fieldOverrides = fieldOverrides;
  if (sectionOrder) out.sectionOrder = sectionOrder;
  if (portalBannerHiddenKeys) out.portalBannerHiddenKeys = portalBannerHiddenKeys;
  if (hiddenSectionTitles) out.hiddenSectionTitles = hiddenSectionTitles;
  return out;
}

export function defaultPortalInventarioFichaConfig(): PortalInventarioFichaConfigV1 {
  return { version: 1 };
}
