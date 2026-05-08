"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

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

export function AuctionFeed() {
  const cat = catalogoHref();
  const [tab, setTab] = useState<AuctionTab>("actuales");
  const [sub, setSub] = useState<EstadoFiltro>("actual");

  const heading = useMemo(() => `${TAB_LABEL[tab]} · vista ${SUB_LABEL[sub]}`, [sub, tab]);

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
        </div>

        <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="sec-subastas" className="text-xl font-black text-neutral-900 md:text-2xl">
              {heading}
            </h2>
            <p className="mt-1 text-sm text-neutral-500">
              Vista demostrativa — el calendario en vivo aparecerá acá cuando haya lotes destacados configurados desde la sala oficial.
            </p>
          </div>
          <p className="max-w-md rounded-lg border border-amber-200/80 bg-amber-50/90 px-3 py-2 text-xs text-amber-950">
            <span className="font-bold">Actualizaciones en vivo:</span> diseñaremos canales en tiempo real para
            pujas y extensiones de cierre (120 s) como en operación Rainworks.
          </p>
        </div>

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
                    Vista listado
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
                  <button
                    type="button"
                    className="text-sm font-bold text-[#009ade] underline-offset-4 hover:underline group-hover:text-[#005f8a]"
                  >
                    Ver detalle del lote
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>

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
