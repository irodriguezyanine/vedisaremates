"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { catalogoHref } from "@/lib/site-config";
import {
  contarRematesVisiblesPortal,
  hrefBuscarPorCategoria,
  type InventarioCategoriaBucket,
  obtenerBucketsCategoriaInventario,
} from "@/lib/nav-ver-stats";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/public-env";

type Props = {
  onNavigate?: () => void;
  /** Lista compacta (móvil) */
  variant?: "dropdown" | "mobile";
};

export function NavVerMenuContent({ onNavigate, variant = "dropdown" }: Props) {
  const cat = catalogoHref();
  const [buckets, setBuckets] = useState<InventarioCategoriaBucket[]>([]);
  const [rematesVisibles, setRematesVisibles] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;

    async function run() {
      if (!isSupabaseConfigured()) {
        setLoading(false);
        setErr(null);
        setBuckets([]);
        setRematesVisibles(0);
        return;
      }
      const sb = createClient();
      if (!sb) {
        setLoading(false);
        setErr(null);
        return;
      }

      try {
        const [b, n] = await Promise.all([
          obtenerBucketsCategoriaInventario(sb),
          contarRematesVisiblesPortal(sb),
        ]);
        if (!cancel) {
          setBuckets(b);
          setRematesVisibles(n);
          setErr(null);
        }
      } catch (e) {
        if (!cancel) {
          setErr(e instanceof Error ? e.message : "No se pudieron cargar categorías.");
          setBuckets([]);
        }
      }
      if (!cancel) setLoading(false);
    }

    void run();
    return () => {
      cancel = true;
    };
  }, []);

  const pad = variant === "dropdown" ? "px-4 py-2" : "px-3 py-2.5";
  const subtle = variant === "dropdown" ? "text-xs text-neutral-500" : "text-xs text-neutral-400";

  const itemClass =
    variant === "dropdown"
      ? "flex items-center justify-between gap-3 px-4 py-2 text-sm hover:bg-neutral-50"
      : "flex items-center justify-between gap-3 rounded-md px-3 py-2.5 text-white/90 hover:bg-white/5";

  return (
    <div role="presentation" className={variant === "dropdown" ? "" : "border-t border-white/10 px-2 py-3"}>
      <p
        className={`${pad} pb-1 text-[11px] font-bold uppercase tracking-wide ${
          variant === "dropdown" ? "text-neutral-500" : "text-neutral-500"
        }`}
      >
        En esta plataforma
      </p>
      <Link
        href={cat}
        target="_blank"
        rel="noopener noreferrer"
        role="menuitem"
        className={itemClass}
        onClick={onNavigate}
      >
        <span className={variant === "dropdown" ? "text-neutral-800" : undefined}>Catálogo completo</span>
        <span className="text-[11px] text-neutral-400">↗</span>
      </Link>
      <Link href="/subastas" role="menuitem" className={itemClass} onClick={onNavigate}>
        <span className={variant === "dropdown" ? "text-neutral-800" : undefined}>Subastas en línea</span>
        {!loading ? (
          <span className="rounded-full bg-[#009ade]/15 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-[#005f8a] dark:bg-white/10 dark:text-neutral-300">
            {rematesVisibles}
          </span>
        ) : (
          <span className="h-5 w-8 animate-pulse rounded bg-neutral-200/50 dark:bg-white/10" />
        )}
      </Link>
      <Link href="/buscar" role="menuitem" className={itemClass} onClick={onNavigate}>
        <span className={variant === "dropdown" ? "text-neutral-800" : undefined}>Todo el inventario filtrable</span>
      </Link>

      <div className="my-2 border-t border-neutral-100 dark:border-white/10" />

      <p
        className={`${pad} pb-1 text-[11px] font-bold uppercase tracking-wide ${
          variant === "dropdown" ? "text-neutral-500" : "text-neutral-500"
        }`}
      >
        Inventario por categoría
      </p>
      <p className={`${pad} pt-0 ${subtle} -mt-1 leading-snug`}>
        Vehículos disponibles por tipo según lotes publicados, en curso o cerrados.
      </p>
      {loading ? <p className={`${pad} ${subtle}`}>Cargando…</p> : null}
      {!loading && buckets.length > 0
        ? buckets.map((b) => (
            <Link
              key={b.valor ?? "__sin__"}
              href={hrefBuscarPorCategoria(b)}
              role="menuitem"
              className={itemClass}
              onClick={onNavigate}
            >
              <span className={variant === "dropdown" ? "truncate text-neutral-800" : "truncate"} title={b.etiqueta}>
                {b.etiqueta}
              </span>
              <span
                className={`shrink-0 tabular-nums ${variant === "dropdown" ? "font-semibold text-neutral-700" : "text-neutral-400"}`}
              >
                {b.cantidad}
              </span>
            </Link>
          ))
        : null}
      {!loading && !err && buckets.length === 0 ? (
        <p className={`${pad} ${subtle}`}>Aún no hay categorías disponibles en subastas visibles.</p>
      ) : null}
    </div>
  );
}
