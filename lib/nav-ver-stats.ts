import type { SupabaseClient } from "@supabase/supabase-js";

import type { InventarioRow } from "@/lib/portal-types";

const PAGE_SIZE = 1000;

/** Misma condición que usan sala y home del portal (`/subastas`, feed). */
const REMATES_ESTADOS_PUBLICOS = ["publicado", "en_curso", "cerrado"] as const;

/** Columnas mínimas de inventario dentro del embed desde `portal_remate_lotes`. */
const INVENTARIO_EN_LOTE_SELECT =
  "id,created_at,patente,marca,modelo,ano,categoria,estado,empresa,valor_minimo,valor_esperado";
const INVENTARIO_EN_LOTE_SELECT_CATEGORIA = "id,categoria";

/** Bucket por valor exacto de `inventario.categoria` (respeta cómo viene en la base). */
export type InventarioCategoriaBucket = {
  /** Valor guardado en la columna, o null = sin categoría */
  valor: string | null;
  /** Texto para el menú */
  etiqueta: string;
  cantidad: number;
};

/** Filtro de la página `/buscar` aplicado sobre inventario en remates visibles al público. */
export type ListaFiltroInventarioPublico =
  | { tipo: "nada" }
  | { tipo: "sin_categoria" }
  | { tipo: "categoria"; valor: string };

type LoteInventarioJoin = {
  inventario_id: string | null;
  inventario: Partial<InventarioRow> | null;
  portal_remates: { estado: string | null } | null;
};

/** PostgREST a veces devuelve el embed como objeto único y a veces como array; unificamos. */
function unwrapEmb<T>(v: T | T[] | null | undefined): T | null {
  if (v === null || v === undefined) return null;
  return Array.isArray(v) ? (v.length ? v[0] ?? null : null) : v;
}

function normalizeLoteJoin(raw: Record<string, unknown>): LoteInventarioJoin {
  return {
    inventario_id: (raw.inventario_id as string | null | undefined) ?? null,
    inventario: unwrapEmb(raw.inventario as Partial<InventarioRow> | Partial<InventarioRow>[] | null) ?? null,
    portal_remates: unwrapEmb(raw.portal_remates as { estado: string | null } | null) ?? null,
  };
}

function estadoRemateVisible(estado: string | null | undefined): boolean {
  return Boolean(estado && (REMATES_ESTADOS_PUBLICOS as readonly string[]).includes(estado));
}

function normalizaCategoria(raw: unknown): string | null {
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

function inventarioCuadraFiltroCategoria(catRaw: unknown, filtro: ListaFiltroInventarioPublico): boolean {
  if (filtro.tipo === "nada") return false;
  const v = normalizaCategoria(catRaw);
  if (filtro.tipo === "sin_categoria") return v === null;
  return v === filtro.valor;
}

export function etiquetaCategoriaHumana(raw: string | null): string {
  if (!raw?.trim()) return "Sin categoría";
  const s = raw.trim();
  const normalized = s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[_\s]+/g, " ")
    .trim();

  const alias: Record<string, string> = {
    vehiculo_liviano: "Vehículo liviano",
    "vehiculo liviano": "Vehículo liviano",
    liviano: "Vehículo liviano",
    vehiculo_pesado: "Vehículo pesado",
    "vehiculo pesado": "Vehículo pesado",
    pesado: "Vehículo pesado",
    chatarra: "Chatarra",
    maquinaria: "Maquinaria",
    moto: "Motocicleta",
    motocicleta: "Motocicleta",
  };
  if (alias[normalized]) return alias[normalized];

  return s
    .split(/[\s_/]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Inventario público desde la perspectiva del visitante: unidades enlazadas a al menos un lote en un remate
 * publicado / en curso / cerrado. Deduplica por `inventario.id` (si un mismo vehículo está en más de un lote vale 1).
 * No usa el barrido masivo de `inventario` (evita números de admin o stock no enlazado a subastas visibles).
 */
export async function obtenerBucketsCategoriaInventario(
  supabase: SupabaseClient,
): Promise<InventarioCategoriaBucket[]> {
  const vistosInv = new Set<string>();
  const conteo = new Map<string | null, number>();

  for (let from = 0; ; from += PAGE_SIZE) {
    let { data, error } = await supabase
      .from("portal_remate_lotes")
      .select(
        `
        inventario_id,
        inventario ( ${INVENTARIO_EN_LOTE_SELECT_CATEGORIA} ),
        portal_remates ( estado )
      `,
      )
      .range(from, from + PAGE_SIZE - 1);

    // Fallback defensivo por compatibilidad de esquema.
    if (error) {
      const retry = await supabase
        .from("portal_remate_lotes")
        .select(
          `
          inventario_id,
          inventario ( id, categoria ),
          portal_remates ( estado )
        `,
        )
        .range(from, from + PAGE_SIZE - 1);
      data = retry.data;
      error = retry.error;
    }

    if (error) throw error;
    const filasCrudas = (data ?? []) as Record<string, unknown>[];
    if (!filasCrudas.length) break;

    for (const raw of filasCrudas) {
      const row = normalizeLoteJoin(raw);
      if (!estadoRemateVisible(row.portal_remates?.estado ?? null)) continue;

      const inv = row.inventario;
      if (typeof inv?.id !== "string") continue;
      if (vistosInv.has(inv.id)) continue;

      vistosInv.add(inv.id);

      const v = normalizaCategoria(inv.categoria ?? null);
      conteo.set(v, (conteo.get(v) ?? 0) + 1);
    }

    if (filasCrudas.length < PAGE_SIZE) break;
  }

  const out: InventarioCategoriaBucket[] = [];
  for (const [valor, cantidad] of conteo) {
    out.push({
      valor,
      etiqueta: etiquetaCategoriaHumana(valor),
      cantidad,
    });
  }

  out.sort((a, b) => {
    if (b.cantidad !== a.cantidad) return b.cantidad - a.cantidad;
    return a.etiqueta.localeCompare(b.etiqueta, "es");
  });
  return out;
}

/** Lista inventario público-en-remates con filtro de categoría (`/buscar`). */
export async function listarInventarioPublicoEnRemates(
  supabase: SupabaseClient,
  filtro: ListaFiltroInventarioPublico,
  maxDistinct: number,
): Promise<(InventarioRow & Record<string, unknown>)[]> {
  if (filtro.tipo === "nada") return [];

  const byId = new Map<string, InventarioRow & Record<string, unknown>>();

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("portal_remate_lotes")
      .select(
        `
        inventario_id,
        inventario ( ${INVENTARIO_EN_LOTE_SELECT} ),
        portal_remates ( estado )
      `,
      )
      .order("created_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;
    const filasCrudas = (data ?? []) as Record<string, unknown>[];
    if (!filasCrudas.length) break;

    for (const raw of filasCrudas) {
      const row = normalizeLoteJoin(raw);
      if (!estadoRemateVisible(row.portal_remates?.estado ?? null)) continue;

      const inv = row.inventario;
      if (!inv?.id || typeof inv.id !== "string") continue;
      if (byId.has(inv.id)) continue;

      if (!inventarioCuadraFiltroCategoria(inv.categoria ?? null, filtro)) continue;

      byId.set(inv.id, inv as InventarioRow & Record<string, unknown>);
      if (byId.size >= maxDistinct) {
        break;
      }
    }

    if (byId.size >= maxDistinct) break;

    if (filasCrudas.length < PAGE_SIZE) break;
  }

  return [...byId.values()].sort((a, b) => {
    const ta = fechaInv(a.created_at);
    const tb = fechaInv(b.created_at);
    return tb - ta;
  });
}

function fechaInv(raw: unknown): number {
  if (raw === null || raw === undefined || raw === "") return 0;
  const t = new Date(raw as string).getTime();
  return Number.isFinite(t) ? t : 0;
}

/** Remates públicos configurados para mostrar contador en navegación. */
export async function contarRematesVisiblesPortal(supabase: SupabaseClient): Promise<number> {
  const { count, error } = await supabase
    .from("portal_remates")
    .select("id", { count: "exact", head: true })
    .in("estado", ["publicado", "en_curso", "cerrado"]);
  if (error) return 0;
  return count ?? 0;
}

/** Query string para enlazar desde el menú "Ver". */
export function hrefBuscarPorCategoria(v: InventarioCategoriaBucket): string {
  if (v.valor === null) return "/buscar?sin_categoria=1";
  return `/buscar?categoria=${encodeURIComponent(v.valor)}`;
}
