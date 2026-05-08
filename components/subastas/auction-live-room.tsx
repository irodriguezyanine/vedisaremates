"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { Session } from "@supabase/supabase-js";

import { AuctionLotesCarousel } from "@/components/subastas/auction-lotes-carousel";
import { InventarioMediaGallery } from "@/components/subastas/inventario-media-gallery";
import { InventarioFichaTecnica } from "@/components/subastas/inventario-ficha-tecnica";
import { formatClp } from "@/lib/format-clp";
import type { InventarioRow, PortalOfertaRow, PortalRemateLoteRow, PortalRemateRow } from "@/lib/portal-types";
import { createClient } from "@/lib/supabase/client";

type Lote = PortalRemateLoteRow & { inventario: InventarioRow | null };

const TZ_CHILE = { timeZone: "America/Santiago" } satisfies Intl.DateTimeFormatOptions;

function formatClDateTime(iso: string): string {
  return new Date(iso).toLocaleString("es-CL", TZ_CHILE);
}

function formatClTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-CL", TZ_CHILE);
}

type Props = {
  initialRemate: PortalRemateRow;
  initialLotes: Lote[];
  viewerId?: string | null;
};

export function AuctionLiveRoom({ initialRemate, initialLotes, viewerId }: Props) {
  const [remate, setRemate] = useState(initialRemate);
  const [lotes] = useState<Lote[]>(initialLotes);
  const [activeId, setActiveId] = useState<string | null>(initialLotes[0]?.id ?? null);
  const [offersByLote, setOffersByLote] = useState<Record<string, PortalOfertaRow[]>>({});
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [tick, setTick] = useState<number | null>(null);

  const active = useMemo(() => lotes.find((l) => l.id === activeId) ?? null, [lotes, activeId]);

  const loadOffers = useCallback(
    async (loteIds: string[]) => {
      if (!loteIds.length) return;
      const sb = createClient();
      if (!sb) return;
      const { data, error } = await sb
        .from("portal_ofertas")
        .select("*")
        .in("lote_id", loteIds)
        .order("created_at", { ascending: false });
      if (error || !data) return;
      const map: Record<string, PortalOfertaRow[]> = {};
      for (const row of data as PortalOfertaRow[]) {
        if (!map[row.lote_id]) map[row.lote_id] = [];
        map[row.lote_id]!.push(row);
      }
      setOffersByLote(map);
    },
    [],
  );

  useEffect(() => {
    queueMicrotask(() => {
      void loadOffers(lotes.map((l) => l.id));
    });
  }, [lotes, loadOffers]);

  useEffect(() => {
    setTick(Date.now());
    const id = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const sb = createClient();
    if (!sb) return;
    void sb.auth.getSession().then(({ data }: { data: { session: Session | null } }) => {
      setSessionEmail(data.session?.user.email ?? null);
    });
  }, []);

  useEffect(() => {
    const sb = createClient();
    const ids = lotes.map((l) => l.id);
    if (!sb || !ids.length) return;

    const ch = sb
      .channel(`portal_ofertas:${remate.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "portal_ofertas" },
        (payload: { new: Record<string, unknown> }) => {
          const row = payload.new as PortalOfertaRow;
          if (!ids.includes(row.lote_id)) return;
          setOffersByLote((prev) => {
            const next = { ...prev };
            const list = next[row.lote_id] ? [row, ...next[row.lote_id]!] : [row];
            next[row.lote_id] = list;
            return next;
          });
        },
      )
      .subscribe();

    const poll = window.setInterval(() => {
      void sb
        .from("portal_remates")
        .select("*")
        .eq("id", remate.id)
        .single()
        .then(({ data }: { data: PortalRemateRow | null }) => {
          if (data) setRemate(data);
        });
    }, 15000);

    return () => {
      void sb.removeChannel(ch);
      window.clearInterval(poll);
    };
  }, [lotes, remate.id]);

  const minNext = useMemo(() => {
    if (!active) return 0;
    const list = offersByLote[active.id] ?? [];
    const max = list.length ? list[0]!.monto : null;
    if (max === null) return Number(active.precio_base) || 0;
    return max + Number(active.incremento_minimo);
  }, [active, offersByLote]);

  async function placeBid() {
    if (!active || !viewerId) {
      setMsg("Iniciá sesión para ofertar.");
      return;
    }
    setBusy(true);
    setMsg(null);
    const monto = Number(amount.replace(/\./g, "").replace(",", "."));
    if (!Number.isFinite(monto) || monto <= 0) {
      setMsg("Monto inválido.");
      setBusy(false);
      return;
    }
    const sb = createClient();
    if (!sb) {
      setMsg("No se pudo iniciar la conexión. Actualizá la página o intentá más tarde.");
      setBusy(false);
      return;
    }
    const { data, error } = await sb.rpc("portal_place_bid", {
      p_lote_id: active.id,
      p_monto: monto,
    });
    if (error) {
      setMsg(error.message);
      setBusy(false);
      return;
    }
    const res = data as { ok?: boolean; error?: string; minimo_requerido?: number; precio_base?: number };
    if (!res?.ok) {
      const detail =
        res?.error === "monto_inferior_al_minimo_siguiente" && res.minimo_requerido != null
          ? ` Mínimo sugerido: ${formatClp(res.minimo_requerido)}.`
          : res?.error === "primera_oferta_debe_superar_precio_base" && res.precio_base != null
            ? ` Precio base: ${formatClp(res.precio_base)}.`
            : "";
      setMsg((res?.error ?? "No se pudo ofertar") + detail);
      setBusy(false);
      return;
    }
    setAmount("");
    await loadOffers(lotes.map((l) => l.id));
    setMsg("¡Oferta registrada!");
    setBusy(false);
  }

  const listForActive = active ? (offersByLote[active.id] ?? []).slice(0, 40) : [];
  const countdownLive =
    tick != null && remate.ends_at ? new Date(remate.ends_at).getTime() - tick : null;

  const canBid =
    viewerId &&
    remate.estado === "en_curso" &&
    tick != null &&
    countdownLive !== null &&
    countdownLive > 0 &&
    (!remate.starts_at || new Date(remate.starts_at).getTime() <= tick);

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:py-10">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <Link href="/subastas" className="text-sm font-semibold text-[#009ade] hover:underline">
            ← Sala de remates
          </Link>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-neutral-900 sm:text-4xl">{remate.titulo}</h1>
          {remate.descripcion?.trim() ? (
            <p className="mt-2 max-w-2xl text-pretty text-neutral-600">{remate.descripcion}</p>
          ) : null}
        </div>
        <div className="w-full shrink-0 rounded-2xl border border-neutral-200 bg-white px-4 py-4 text-sm shadow-sm sm:max-w-sm">
          <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">Estado del remate</p>
          <p className="mt-2 text-lg font-bold capitalize text-neutral-900">{remate.estado.replaceAll("_", " ")}</p>
          <p className={`mt-2 text-xs font-medium ${countdownLive !== null && countdownLive <= 0 ? "text-red-600" : "text-emerald-700"}`}>
            {countdownLive !== null && countdownLive <= 0
              ? "Este remate ya cerró según la fecha configurada."
              : remate.ends_at
                ? `Cierra ${formatClDateTime(remate.ends_at)}`
                : null}
          </p>
          {viewerId ? (
            <p className="mt-4 border-t border-neutral-100 pt-3 text-[11px] text-neutral-500">
              Conectado como <span className="font-medium text-neutral-700">{sessionEmail}</span>
            </p>
          ) : (
            <Link
              href={`/ingreso?redirect=/subastas/${remate.id}`}
              className="mt-3 inline-block rounded-lg bg-[#009ade]/10 px-3 py-2 text-xs font-bold text-[#009ade] hover:bg-[#009ade]/15"
            >
              Iniciá sesión para ofertar
            </Link>
          )}
        </div>
      </div>

      {lotes.length === 0 ? (
        <p className="text-neutral-600">Este remate aún no tiene lotes publicados.</p>
      ) : (
        <div className="space-y-5 sm:space-y-6">
          <AuctionLotesCarousel compact lotes={lotes} activeId={activeId} onSelect={setActiveId} />

          {active ? (
            <>
              <div className="space-y-1 border-b border-neutral-100 pb-4">
                <h2 className="text-pretty text-2xl font-black tracking-tight text-neutral-900 sm:text-3xl">
                  {active.inventario
                    ? [active.inventario.marca, active.inventario.modelo].filter(Boolean).join(" ") ||
                      (active.titulo ?? "Vehículo")
                    : (active.titulo ?? "Detalle del lote")}
                </h2>
                {active.inventario?.patente || active.inventario?.ano ? (
                  <p className="text-sm text-neutral-500">
                    {[active.inventario?.patente, active.inventario?.ano ? String(active.inventario.ano) : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                ) : active.inventario?.categoria ? (
                  <p className="text-sm text-neutral-500">{String(active.inventario.categoria)}</p>
                ) : null}
              </div>

              <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)] lg:items-start lg:gap-8 xl:gap-10">
                <div className="min-w-0 space-y-5">
                  <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-md">
                    <div className="bg-neutral-50/30 px-4 py-5 sm:px-6 sm:py-6">
                      <InventarioMediaGallery
                        inventario={(active.inventario ?? null) as (InventarioRow & Record<string, unknown>) | null}
                        presentation="showcase"
                        verticalPhotoThumbs
                      />
                      {!active.inventario ? (
                        <p className="text-center text-sm text-neutral-500">No hay fotos ni visor 360° para mostrar.</p>
                      ) : null}
                    </div>

                    {active.inventario ? (
                      <div className="border-t border-neutral-100 bg-white px-4 py-6 sm:px-6 sm:py-8">
                        <InventarioFichaTecnica
                          inventario={active.inventario as InventarioRow & Record<string, unknown>}
                          lotePortal={{
                            id: active.id,
                            orden: active.orden,
                            titulo: active.titulo,
                            descripcion: active.descripcion,
                            precio_base: active.precio_base,
                            incremento_minimo: active.incremento_minimo,
                          }}
                          rematePortal={{
                            id: remate.id,
                            titulo: remate.titulo,
                            starts_at: remate.starts_at,
                            ends_at: remate.ends_at,
                          }}
                        />
                      </div>
                    ) : (
                      <p className="border-t border-neutral-100 px-4 py-4 text-sm text-neutral-500 sm:px-6">
                        Lote sin ficha Tasaciones enlazada.
                      </p>
                    )}
                  </div>
                </div>

                <aside className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-4 lg:self-start">
                  <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm ring-1 ring-neutral-100/80">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">Precios del lote</p>
                    <p className="mt-2 text-2xl font-black tabular-nums text-neutral-900">{formatClp(active.precio_base)}</p>
                    <p className="mt-1 text-xs text-neutral-600">Precio base publicado</p>
                    <div className="mt-4 border-t border-neutral-100 pt-4">
                      <p className="text-sm font-semibold text-neutral-700">Siguiente oferta mínima</p>
                      <p className="mt-1 text-xl font-bold tabular-nums text-[#0f3d5c]">{formatClp(minNext)}</p>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
                    <h3 className="text-lg font-bold text-neutral-900">Tu oferta</h3>
                    {!canBid ? (
                      <p className="mt-2 text-sm text-neutral-600">
                        {remate.estado !== "en_curso"
                          ? "Cuando el remate esté en curso podrás ofertar."
                          : countdownLive !== null && countdownLive <= 0
                            ? "El remate ya cerró según la fecha de fin."
                            : tick === null
                              ? "Cargando estado del remate…"
                              : !viewerId
                                ? "Iniciá sesión para ofertar."
                                : remate.starts_at && new Date(remate.starts_at).getTime() > tick
                                  ? "Esperando la hora de inicio."
                                  : "No podés ofertar en este momento."}
                      </p>
                    ) : (
                      <>
                        <label className="mt-3 block text-sm text-neutral-600">
                          Monto (CLP)
                          <input
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            inputMode="numeric"
                            className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-neutral-900"
                            placeholder={String(Math.ceil(minNext))}
                          />
                        </label>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void placeBid()}
                          className="mt-4 w-full rounded-lg bg-gradient-to-r from-[#33C7E3] to-[#2ab0c9] py-3 text-sm font-bold text-[#0f1f2c] disabled:opacity-50"
                        >
                          {busy ? "Enviando…" : "Confirmar oferta"}
                        </button>
                      </>
                    )}
                  {msg ? <p className="mt-3 text-sm text-neutral-700">{msg}</p> : null}
                  </div>

                  <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
                  <h3 className="text-lg font-bold text-neutral-900">Actividad reciente</h3>
                  <ul className="mt-3 max-h-80 space-y-2 overflow-auto text-sm">
                    {listForActive.length === 0 ? (
                      <li className="text-neutral-500">Aún no hay ofertas en este lote.</li>
                    ) : (
                      listForActive.map((o) => (
                        <li
                          key={o.id}
                          className={`flex justify-between gap-2 rounded-lg border border-neutral-100 px-2 py-1 ${
                            viewerId && o.user_id === viewerId ? "bg-[#fff9e6] border-[#FFC600]/40" : ""
                          }`}
                        >
                          <span className="text-neutral-500">{formatClTime(o.created_at)}</span>
                          <span className="font-bold text-neutral-900">{formatClp(o.monto)}</span>
                          <span className="text-[10px] text-neutral-400">
                            {o.user_id === viewerId ? "vos" : "participante"}
                          </span>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              </aside>
            </div>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
