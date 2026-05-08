import type { SupabaseClient } from "@supabase/supabase-js";

const PAGE_SIZE = 1000;

/** Bucket por valor exacto de `inventario.categoria` (respeta cómo viene en la base). */
export type InventarioCategoriaBucket = {
  /** Valor guardado en la columna, o null = sin categoría */
  valor: string | null;
  /** Texto para el menú */
  etiqueta: string;
  cantidad: number;
};

export function etiquetaCategoriaHumana(raw: string | null): string {
  if (!raw?.trim()) return "Sin categoría";
  const s = raw.trim();
  return s
    .split(/[\s_/]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join(" ");
}

/** Agrega todas las categorías que el cliente puede leer por RLS (inventario anónimo/usuario según proyecto). */
export async function obtenerBucketsCategoriaInventario(
  supabase: SupabaseClient,
): Promise<InventarioCategoriaBucket[]> {
  const conteo = new Map<string | null, number>();

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase.from("inventario").select("categoria").range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const filas = data ?? [];
    if (!filas.length) break;
    for (const r of filas) {
      const v =
        typeof r.categoria === "string" && r.categoria.trim() ? (r.categoria.trim() as string) : null;
      conteo.set(v, (conteo.get(v) ?? 0) + 1);
    }
    if (filas.length < PAGE_SIZE) break;
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
