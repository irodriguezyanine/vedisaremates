"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { PortalRemateRow } from "@/lib/portal-types";
import { classifyRemateForFeed, countdownLabelFromEndsAt, type RemateFeedSlice } from "@/lib/portal-remate-feed";
import { fetchRemateThumbnailMap } from "@/lib/remate-cover-thumbnails";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/public-env";
import { catalogoHref } from "@/lib/site-config";

type AuctionTab = "actuales" | "proximas" | "cerradas";
type EstadoFiltro = "actual" | "upcoming" | "cerrado";

const DEMO_LOTES = [
  {
    titulo: "ESPECIAL VENTAS DIRECTAS",
    subtitulo: "Licitación abierta — revisa condición en bodega",
    estado: "abierta" as const,
    countdown: null as string | null,
  },
  {
    titulo: "Referencia liviano",
    subtitulo: "Aceptar ofertas finales",
    estado: "finales" as const,
    countdown: "00:42:18",
  },
  {
    titulo: "Referencia cerrada",
    subtitulo: "Remate finalizado — consulta histórico en catálogo",
    estado: "cerrada" as const,
    countdown: null,
  },
];

const TAB_LABEL: Record<AuctionTab, string> = {
  actuales: "Subastas actuales",
  proximas: "Próximas subastas",
  cerradas: "Subastas cerradas",
};

const SUB_LABEL: Record<EstadoFiltro, string> = {
  actual: "En curso",
  upcoming: "Próximo cierre",
  cerrado: "Histórico",
};

function estadoBadge(estado: (typeof DEMO_LOTES)[number]["estado"]) {
  if (estado === "abierta") {
    return (
      <span className="rounded-md bg-emerald-600 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white ring-2 ring-emerald-500/30">
        Licitación abierta
      </span>
    );
  }
  if (estado === "finales") {
    return (
      <span className="rounded-md bg-amber-400 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-neutral-900 ring-2 ring-amber-300/80">
        Ofertas finales
      </span>
    );
  }
  return (
    <span className="rounded-md bg-neutral-500 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
      Cerrada
    </span>
  );
}

function badgeForSlice(slice: RemateFeedSlice, remateEstado: PortalRemateRow["estado"]) {
  if (slice === "cerrada") {
    return (
      <span className="rounded-md bg-neutral-500 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
        Cerrada
      </span>
    );
  }
  if (slice === "proxima") {
    return (
      <span className="rounded-md bg-amber-400 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-neutral-900 ring-2 ring-amber-300/80">
        Próximo inicio
      </span>
    );
  }
  if (remateEstado === "en_curso") {
    return (
      <span className="rounded-md bg-emerald-600 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white ring-2 ring-emerald-500/30">
        En curso
      </span>
    );
  }
  return (
    <span className="rounded-md bg-sky-600 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
      Publicado
    </span>
  );
}

function tabToSlice(tab: AuctionTab): RemateFeedSlice {
  if (tab === "actuales") return "actual";
  if (tab === "proximas") return "proxima";
  return "cerrada";
}

export function AuctionFeed() {
  const cat = catalogoHref();
  const [tab, setTab] = useState<AuctionTab>("actuales");
  const [sub, setSub] = useState<EstadoFiltro>("actual");
  const [bundle, setBundle] = useState<
    | { kind: "loading" }
    | { kind: "demo" }
    | { kind: "live"; rows: PortalRemateRow[]; err: string | null }
  >({ kind: "loading" });

  useEffect(() => {
    async function pull() {
      if (!isSupabaseConfigured()) {
        setBundle({ kind: "demo" });
        return;
      }
      const sb = createClient();
      if (!sb) {
        setBundle({ kind: "demo" });
        return;
      }
      const { data, error } = await sb
        .from("portal_remates")
        .select("*")
        .in("estado", ["publicado", "en_curso", "cerrado"])
        .order("ends_at", { ascending: true });
      if (error) {
        setBundle({ kind: "live", rows: [], err: "No pudimos cargar los remates en este momento." });
        return;
      }
      setBundle({
        kind: "live",
        rows: ((data ?? []) as PortalRemateRow[]) || [],
        err: null,
      });
    }
    void pull();
  }, []);

  const useDemo = bundle.kind === "demo";
  const liveRows = bundle.kind === "live" ? bundle.rows : [];
  const liveError = bundle.kind === "live" ? bundle.err : null;
  const [, setTick] = useState(0);
  const [thumbMap, setThumbMap] = useState<Record<string, string | null>>({});

  const liveIdsKey =
    bundle.kind === "live" ? [...bundle.rows].map((r) => r.id).sort().join(",") : "";

  useEffect(() => {
    if (bundle.kind !== "live") {
      setThumbMap({});
      return;
    }
    const ids = bundle.rows.map((r) => r.id);
    if (!ids.length) {
      setThumbMap({});
      return;
    }

    let cancelled = false;

    async function thumbs() {
      const sb = createClient();
      if (!sb) return;
      try {
        const m = await fetchRemateThumbnailMap(sb, ids);
        if (!cancelled) setThumbMap(m);
      } catch {
        if (!cancelled) setThumbMap({});
      }
    }

    void thumbs();
    return () => {
      cancelled = true;
    };
  }, [bundle.kind, liveIdsKey]);

  useEffect(() => {
    if (useDemo || bundle.kind === "loading") return;
    const id = window.setInterval(() => setTick((x) => x + 1), 1000);
    return () => window.clearInterval(id);
  }, [useDemo, bundle.kind]);

  const slicedLive = useMemo(() => {
    const want = tabToSlice(tab);
    const list = liveRows.filter((r) => classifyRemateForFeed(r) === want);
    const sign = tab === "cerradas" ? -1 : 1;
    return [...list].sort((a, b) => sign * (new Date(a.ends_at).getTime() - new Date(b.ends_at).getTime()));
  }, [liveRows, tab]);

  const heading = useMemo(() => {
    if (bundle.kind === "loading") return "Subastas";
    return useDemo ? `${TAB_LABEL[tab]} · vista ${SUB_LABEL[sub]}` : TAB_LABEL[tab];
  }, [sub, tab, useDemo, bundle.kind]);

  const renderLiveSubtitle = useCallback((r: PortalRemateRow) => {
    if (r.descripcion?.trim()) return r.descripcion.trim().slice(0, 280);
    return "Revisá ficha en la sala oficial y verificá condiciones antes de ofertar.";
  }, []);

  return (
    <section aria-labelledby="sec-subastas" className="border-y border-neutral-200/90 bg-[linear-gradient(180deg,#f8fafc_0%,#ffffff_45%)]">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-wrap gap-1 rounded-xl bg-white/90 p-1.5 shadow-md ring-1 ring-black/[0.06] backdrop-blur">
            {(
              [
                ["actuales", "Actuales"],
                ["proximas", "Próximas"],
                ["cerradas", "Cerradas"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`rounded-lg px-4 py-2.5 text-xs font-bold uppercase tracking-wide transition sm:text-sm ${
                  tab === key
                    ? "bg-[#1a2332] text-[#FFC600] shadow-inner"
                    : "text-neutral-600 hover:bg-neutral-100"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {useDemo ? (
            <div className="flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-wide">
              {(
                [
                  ["actual", "Actual"],
                  ["upcoming", "Próximo"],
                  ["cerrado", "Cerrado"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSub(key)}
                  className={`rounded-full border px-3.5 py-1.5 transition ${
                    sub === key
                      ? "border-[#009ade] bg-sky-50 text-[#005f8a] shadow-sm"
                      : "border-neutral-200 bg-white text-neutral-600 hover:border-[#AAAAAA]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : (
            <Link
              href="/subastas"
              className="text-xs font-bold uppercase tracking-wide text-[#009ade] hover:underline"
            >
              Ver sala completa →
            </Link>
          )}
        </div>

        <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="sec-subastas" className="text-xl font-black text-neutral-900 md:text-2xl">
              {heading}
            </h2>
            <p className="mt-1 text-sm text-neutral-600">
              {bundle.kind === "loading"
                ? "Cargando remates publicados…"
                : useDemo
                  ? (
                      <>
                        Ejemplo visual — así se verán los bloques destacados cuando publiques remates reales desde el panel{" "}
                        <span className="font-medium text-neutral-800">Administración → Remates y lotes</span>.
                      </>
                    )
                  : "Estos remates son los mismos que administrás en el panel y los que participantes ven en la sala en línea."}
            </p>
          </div>
          {useDemo ? (
            <p className="max-w-md rounded-lg border border-amber-200/80 bg-amber-50/90 px-3 py-2 text-xs text-amber-950">
              <span className="font-bold">Tip:</span> los contadores y estados se actualizan según fechas y estado del
              remate en la base.
            </p>
          ) : null}
          {!useDemo && liveError ? (
            <p className="max-w-md rounded-lg border border-amber-200/80 bg-amber-50/90 px-3 py-2 text-xs text-amber-950">
              {liveError}
            </p>
          ) : null}
        </div>

        {bundle.kind === "loading" ? (
          <div className="grid gap-7 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((k) => (
              <div
                key={k}
                className="h-[320px] animate-pulse rounded-2xl border border-neutral-200/80 bg-gradient-to-br from-neutral-100 to-neutral-200/60"
              />
            ))}
          </div>
        ) : useDemo ? (
          <div className="grid gap-7 sm:grid-cols-2 lg:grid-cols-3">
            {DEMO_LOTES.map((lote, i) => (
              <article
                key={i}
                className="group flex flex-col overflow-hidden rounded-2xl border border-neutral-200/90 bg-white shadow-[0_8px_30px_rgba(0,0,0,0.06)] ring-1 ring-black/[0.03] transition hover:-translate-y-1 hover:shadow-[0_16px_44px_rgba(0,154,222,0.12)]"
              >
                <div className="relative aspect-[4/3] overflow-hidden bg-gradient-to-br from-neutral-100 via-neutral-200 to-sky-100/40">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(51,199,227,0.25),transparent_55%)]" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="rounded-full bg-white/70 px-4 py-1.5 text-xs font-semibold text-neutral-500 backdrop-blur-sm">
                      Ejemplo
                    </span>
                  </div>
                  <div className="absolute left-3 top-3">{estadoBadge(lote.estado)}</div>
                </div>
                <div className="flex flex-1 flex-col p-5">
                  <h3 className="line-clamp-2 text-lg font-bold text-neutral-900">{lote.titulo}</h3>
                  <p className="mt-2 text-sm text-neutral-600">{lote.subtitulo}</p>
                  {lote.countdown ? (
                    <p className="mt-3 text-xs font-medium text-red-700">
                      Cierra en: <span className="tabular-nums font-bold">{lote.countdown}</span>
                    </p>
                  ) : (
                    <p className="mt-3 text-xs text-neutral-500">Verifica ficha y condiciones antes de ofertar.</p>
                  )}
                  <div className="mt-auto border-t border-neutral-100 pt-4">
                    <span className="text-sm font-bold text-neutral-400">Conectá la base para habilitar enlaces</span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : slicedLive.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50/80 px-6 py-14 text-center">
            <p className="text-neutral-700">
              No hay remates en esta categoría todavía. Creá o publicá eventos desde{" "}
              <strong className="font-semibold text-neutral-900">Administración → Remates y lotes</strong>.
            </p>
            <Link href="/subastas" className="mt-4 inline-block font-bold text-[#009ade] hover:underline">
              Abrir sala de subastas →
            </Link>
          </div>
        ) : (
          <div className="grid gap-7 sm:grid-cols-2 lg:grid-cols-3">
            {slicedLive.map((r) => {
              const slice = classifyRemateForFeed(r);
              const cd = slice !== "cerrada" ? countdownLabelFromEndsAt(r.ends_at) : null;
              const thumbCover = thumbMap[r.id];

              return (
                <article
                  key={r.id}
                  className="group flex flex-col overflow-hidden rounded-2xl border border-neutral-200/90 bg-white shadow-[0_8px_30px_rgba(0,0,0,0.06)] ring-1 ring-black/[0.03] transition hover:-translate-y-1 hover:shadow-[0_16px_44px_rgba(0,154,222,0.12)]"
                >
                  <div className="relative aspect-[4/3] overflow-hidden bg-gradient-to-br from-neutral-100 via-neutral-200 to-sky-100/40">
                    {thumbCover ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={thumbCover}
                        alt=""
                        className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
                        loading="lazy"
                      />
                    ) : (
                      <>
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(51,199,227,0.25),transparent_55%)]" />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="rounded-full bg-white/70 px-4 py-1.5 text-xs font-semibold text-neutral-500 backdrop-blur-sm">
                            Sin foto en primer lote
                          </span>
                        </div>
                      </>
                    )}
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-transparent" aria-hidden />
                    <div className="absolute left-3 top-3">{badgeForSlice(slice, r.estado)}</div>
                  </div>
                  <div className="flex flex-1 flex-col p-5">
                    <h3 className="line-clamp-2 text-lg font-bold text-neutral-900">{r.titulo}</h3>
                    <p className="mt-2 line-clamp-3 text-sm text-neutral-600">{renderLiveSubtitle(r)}</p>
                    {cd ? (
                      <p className="mt-3 text-xs font-medium text-red-700">
                        Cierra en: <span className="tabular-nums font-bold">{cd}</span>
                      </p>
                    ) : (
                      <p className="mt-3 text-xs text-neutral-500">
                        Cierre: {new Date(r.ends_at).toLocaleString("es-CL")}
                      </p>
                    )}
                    <div className="mt-auto border-t border-neutral-100 pt-4">
                      <Link
                        href={`/subastas/${r.id}`}
                        className="text-sm font-bold text-[#009ade] underline-offset-4 hover:underline group-hover:text-[#005f8a]"
                      >
                        Ir a la sala del remate →
                      </Link>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        <div className="mt-12 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link
            href={cat}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[48px] min-w-[200px] items-center justify-center rounded-xl bg-[#1a2332] px-8 py-3 text-sm font-bold text-[#FFC600] shadow-lg transition hover:bg-[#252f3f]"
          >
            Ver catálogo completo
          </Link>
          <Link
            href="/como-participar"
            className="inline-flex min-h-[48px] items-center justify-center rounded-xl border-2 border-[#009ade] px-8 py-3 text-sm font-bold text-[#009ade] hover:bg-sky-50"
          >
            Cómo participar
          </Link>
        </div>
      </div>
    </section>
  );
}
