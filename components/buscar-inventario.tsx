"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { InventarioRow } from "@/lib/portal-types";
import {
  etiquetaCategoriaHumana,
  hrefBuscarPorCategoria,
  listarInventarioPublicoEnRemates,
  obtenerBucketsCategoriaInventario,
  type InventarioCategoriaBucket,
  type ListaFiltroInventarioPublico,
} from "@/lib/nav-ver-stats";
import { catalogoHref } from "@/lib/site-config";
import { formatClp } from "@/lib/format-clp";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/public-env";

const MOSTRAR_MAX = 2000;

type Row = InventarioRow & Record<string, unknown>;

/** Deriva modo de lista según URL; `categoria=vacío` se ignora como filtro válido */
function filtroDesdeBusqueda({
  sinCategoria,
  categoriaDecoded,
}: {
  sinCategoria: boolean;
  categoriaDecoded: string | undefined;
}): ListaFiltroInventarioPublico {
  if (sinCategoria) return { tipo: "sin_categoria" };
  if (categoriaDecoded === undefined) return { tipo: "nada" };
  const trimmed = String(categoriaDecoded).trim();
  if (!trimmed) return { tipo: "nada" };
  return { tipo: "categoria", valor: trimmed };
}

export function BuscarInventario() {
  const sp = useSearchParams();
  const categoriaParam = sp.get("categoria");
  const sinCategoria = sp.get("sin_categoria") === "1";

  const categoriaDecoded = useMemo(() => {
    if (sinCategoria) return undefined;
    if (!categoriaParam) return undefined;
    try {
      return decodeURIComponent(categoriaParam);
    } catch {
      return categoriaParam;
    }
  }, [categoriaParam, sinCategoria]);

  const modoLista = useMemo(
    () => filtroDesdeBusqueda({ sinCategoria, categoriaDecoded }),
    [sinCategoria, categoriaDecoded],
  );

  const tieneFiltro = modoLista.tipo !== "nada";

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(tieneFiltro);
  const [err, setErr] = useState<string | null>(null);
  const [bucketsSidebar, setBucketsSidebar] = useState<InventarioCategoriaBucket[]>([]);
  const [sideErr, setSideErr] = useState<string | null>(null);

  const loadLista = useCallback(async () => {
    if (!tieneFiltro) {
      setRows([]);
      setErr(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setErr(null);
    if (!isSupabaseConfigured()) {
      setRows([]);
      setLoading(false);
      setErr("Servicio no disponible en este momento.");
      return;
    }
    const sb = createClient();
    if (!sb) {
      setRows([]);
      setLoading(false);
      return;
    }
    try {
      const filas = await listarInventarioPublicoEnRemates(sb, modoLista, MOSTRAR_MAX);
      setRows(filas);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error al cargar inventario.");
      setRows([]);
    }
    setLoading(false);
  }, [tieneFiltro, modoLista]);

  useEffect(() => {
    queueMicrotask(() => {
      void loadLista();
    });
  }, [loadLista]);

  useEffect(() => {
    async function buckets() {
      if (!isSupabaseConfigured()) {
        setBucketsSidebar([]);
        return;
      }
      const sb = createClient();
      if (!sb) return;
      try {
        const b = await obtenerBucketsCategoriaInventario(sb);
        setBucketsSidebar(b);
        setSideErr(null);
      } catch (e) {
        setBucketsSidebar([]);
        setSideErr(e instanceof Error ? e.message : "Error categorías.");
      }
    }
    queueMicrotask(() => {
      void buckets();
    });
  }, []);

  const titulo =
    modoLista.tipo === "sin_categoria"
      ? "Inventario — sin categoría"
      : modoLista.tipo === "categoria"
        ? `Inventario — ${etiquetaCategoriaHumana(modoLista.valor)}`
        : "Inventario filtrable";

  const subtitulo =
    modoLista.tipo !== "nada"
      ? "Solo aparecen vehículos en lotes de subastas publicadas, en curso o cerradas (igual que en la sala)."
      : "Los números y listas muestran solo stock en esas subastas visibles, no todo el inventario interno.";

  const cat = catalogoHref();

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
        <main className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold text-neutral-900">{titulo}</h1>
          <p className="mt-2 text-neutral-600">{subtitulo}</p>

          {tieneFiltro ? (
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/buscar"
                className="text-sm font-medium text-[#009ade] underline-offset-4 hover:underline"
              >
                Limpiar filtro
              </Link>
              <Link
                href={cat}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-neutral-600 underline-offset-4 hover:text-[#009ade] hover:underline"
              >
                Abrir catálogo externo ↗
              </Link>
            </div>
          ) : null}

          {!tieneFiltro ? (
            <p className="mt-10 text-neutral-600">
              Todavía no hay filtro aplicado. Cuando filtres verás solo los vehículos que están cargados como lotes en
              remates públicos (publicado, en curso o cerrados).
            </p>
          ) : loading ? (
            <p className="mt-10 text-neutral-500">Cargando inventario…</p>
          ) : err ? (
            <p className="mt-10 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{err}</p>
          ) : rows.length === 0 ? (
            <p className="mt-10 text-neutral-600">No hay filas visibles para este filtro.</p>
          ) : (
            <>
              <p className="mt-6 text-sm text-neutral-500">
                Mostrando hasta {Math.min(rows.length, MOSTRAR_MAX)} registros
                {modoLista.tipo === "categoria" ? ` en «${etiquetaCategoriaHumana(modoLista.valor)}»` : ""}.
              </p>
              <div className="mt-4 overflow-x-auto rounded-lg border border-neutral-200 bg-white shadow-sm">
                <table className="min-w-full text-left text-sm text-neutral-800">
                  <thead className="border-b border-neutral-200 bg-neutral-50">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Patente</th>
                      <th className="px-3 py-2 font-semibold">Marca / modelo</th>
                      <th className="px-3 py-2 font-semibold">Categoría</th>
                      <th className="px-3 py-2 font-semibold">Estado</th>
                      <th className="hidden px-3 py-2 font-semibold md:table-cell">Valor mín.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={String(r.id)} className="border-b border-neutral-100 last:border-0">
                        <td className="whitespace-nowrap px-3 py-2 font-mono text-neutral-900">
                          {String(r.patente ?? "—")}
                        </td>
                        <td className="px-3 py-2">
                          {[r.marca, r.modelo].filter(Boolean).join(" ") || "—"}
                          {r.ano ? <span className="text-neutral-500"> ({r.ano})</span> : null}
                        </td>
                        <td className="max-w-[10rem] truncate px-3 py-2 text-neutral-600" title={String(r.categoria ?? "")}>
                          {etiquetaCategoriaHumana(typeof r.categoria === "string" ? r.categoria : null)}
                        </td>
                        <td className="px-3 py-2 text-neutral-600">{String(r.estado ?? "—")}</td>
                        <td className="hidden whitespace-nowrap px-3 py-2 md:table-cell">{formatClp(r.valor_minimo)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </main>

        <aside className="w-full shrink-0 lg:sticky lg:top-24 lg:max-w-sm">
          <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wide text-neutral-500">Filtrar por categoría</p>
            {sideErr ? (
              <p className="mt-2 text-xs text-amber-800">{sideErr}</p>
            ) : bucketsSidebar.length === 0 ? (
              <p className="mt-2 text-xs text-neutral-500">Sin datos de categorías.</p>
            ) : (
              <ul className="mt-3 space-y-1">
                {bucketsSidebar.map((b) => {
                  const href = hrefBuscarPorCategoria(b);
                  const activo =
                    (modoLista.tipo === "sin_categoria" && b.valor === null) ||
                    (modoLista.tipo === "categoria" && b.valor !== null && b.valor === modoLista.valor);

                  return (
                    <li key={b.valor ?? "__sin__"}>
                      <Link
                        href={href}
                        className={`flex items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors ${
                          activo ? "bg-[#009ade]/10 font-semibold text-[#005f8a]" : "text-neutral-700 hover:bg-neutral-50"
                        }`}
                      >
                        <span className="truncate">{b.etiqueta}</span>
                        <span className="tabular-nums text-neutral-500">{b.cantidad}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
            <Link href="/subastas" className="mt-4 block text-sm font-medium text-[#009ade] underline-offset-4 hover:underline">
              Ir a Subastas en línea →
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
