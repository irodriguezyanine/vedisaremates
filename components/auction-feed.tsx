"use client";

import { useState } from "react";

type AuctionTab = "actuales" | "proximas" | "cerradas";
type EstadoFiltro = "actual" | "upcoming" | "cerrado";

const DEMO_LOTES = [
  {
    titulo: "ESPECIAL VENTAS DIRECTAS",
    subtitulo: "Licitación abierta",
    estado: "abierta" as const,
    countdown: null as string | null,
  },
  {
    titulo: "Renault Symbol — referencia visual",
    subtitulo: "Aceptar ofertas finales",
    estado: "finales" as const,
    countdown: "00:42:18",
  },
  {
    titulo: "Chevrolet Sail — ejemplo",
    subtitulo: "Oferta cerrada",
    estado: "cerrada" as const,
    countdown: null,
  },
];

function estadoBadge(estado: (typeof DEMO_LOTES)[number]["estado"]) {
  if (estado === "abierta") {
    return (
      <span className="rounded bg-emerald-600 px-2 py-0.5 text-[11px] font-semibold uppercase text-white">
        Licitación abierta
      </span>
    );
  }
  if (estado === "finales") {
    return (
      <span className="rounded bg-amber-500 px-2 py-0.5 text-[11px] font-semibold uppercase text-neutral-900">
        Ofertas finales
      </span>
    );
  }
  return (
    <span className="rounded bg-neutral-500 px-2 py-0.5 text-[11px] font-semibold uppercase text-white">
      Cerrada
    </span>
  );
}

export function AuctionFeed() {
  const [tab, setTab] = useState<AuctionTab>("actuales");
  const [sub, setSub] = useState<EstadoFiltro>("actual");

  return (
    <section className="border-y border-neutral-200 bg-neutral-50/80">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        {/* Pestañas principales */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-wrap gap-1 rounded-lg bg-white p-1 shadow-sm ring-1 ring-black/5">
            {(
              [
                ["actuales", "SUBASTAS ACTUALES"],
                ["proximas", "PRÓXIMAS SUBASTAS"],
                ["cerradas", "SUBASTAS CERRADAS"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`rounded-md px-4 py-2 text-xs font-semibold uppercase tracking-wide transition sm:text-sm ${
                  tab === key
                    ? "bg-[#252f3f] text-[#FFC600]"
                    : "text-neutral-600 hover:bg-neutral-100"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Sub-filtros */}
          <div className="flex flex-wrap gap-2 text-xs uppercase">
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
                className={`rounded-full border px-3 py-1 font-medium ${
                  sub === key
                    ? "border-[#33C7E3] bg-[#33C7E3]/10 text-[#0d5a69]"
                    : "border-neutral-200 bg-white text-neutral-600 hover:border-[#AAAAAA]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-bold text-neutral-900">Destacados ({tab})</h2>
          <p className="text-xs text-amber-800">
            <span className="font-semibold">Actualizaciones en vivo:</span> próximamente conectadas a datos
            reales desde Supabase.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {DEMO_LOTES.map((lote, i) => (
            <article
              key={i}
              className="overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm ring-1 ring-black/5 transition hover:shadow-md"
            >
              <div className="relative aspect-[4/3] bg-gradient-to-br from-neutral-200 to-neutral-300">
                <div className="absolute inset-0 flex items-center justify-center text-neutral-500">
                  <span className="text-sm font-medium">Imagen de listado</span>
                </div>
                <div className="absolute left-2 top-2">{estadoBadge(lote.estado)}</div>
              </div>
              <div className="space-y-2 p-4">
                <h3 className="line-clamp-2 font-semibold text-neutral-900">{lote.titulo}</h3>
                <p className="text-sm text-neutral-600">{lote.subtitulo}</p>
                {lote.countdown ? (
                  <p className="text-xs text-red-700">
                    Cierra en: <strong className="tabular-nums">{lote.countdown}</strong>
                  </p>
                ) : (
                  <p className="text-xs text-neutral-500">Consulte detalle y condiciones antes de ofertar.</p>
                )}
              </div>
              <div className="border-t border-neutral-100 px-4 py-3">
                <button
                  type="button"
                  className="text-sm font-semibold text-[#33C7E3] hover:underline"
                >
                  Ver detalle del lote
                </button>
              </div>
            </article>
          ))}
        </div>

        <div className="mt-10 text-center">
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-md border border-[#252f3f] bg-white px-6 py-3 text-sm font-semibold text-[#252f3f] shadow-sm hover:bg-[#252f3f] hover:text-[#FFC600]"
          >
            Ver todos los lotes
          </button>
        </div>
      </div>
    </section>
  );
}
