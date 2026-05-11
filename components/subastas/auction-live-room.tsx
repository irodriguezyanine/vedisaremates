"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { AuctionLotesCarousel } from "@/components/subastas/auction-lotes-carousel";
import { InventarioMediaGallery } from "@/components/subastas/inventario-media-gallery";
import { InventarioFichaTecnica } from "@/components/subastas/inventario-ficha-tecnica";
import { formatClp } from "@/lib/format-clp";
import type {
  InventarioRow,
  PortalOfertaRow,
  PortalRemateLoteRow,
  PortalRemateRow,
  PortalRematesConfigRow,
} from "@/lib/portal-types";
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
  fichaDisplayConfig?: unknown | null;
  /** Lote activo inicial (ej. viene de ?lote= al abrir desde el catálogo de fotos). */
  initialActiveLoteId?: string | null;
};

export function AuctionLiveRoom({
  initialRemate,
  initialLotes,
  viewerId,
  fichaDisplayConfig,
  initialActiveLoteId = null,
}: Props) {
  const searchParams = useSearchParams();

  const [remate, setRemate] = useState(initialRemate);
  const [lotes] = useState<Lote[]>(initialLotes);
  const [activeId, setActiveId] = useState<string | null>(
    initialActiveLoteId && initialLotes.some((l) => l.id === initialActiveLoteId)
      ? initialActiveLoteId
      : (initialLotes[0]?.id ?? null),
  );
  const [offersByLote, setOffersByLote] = useState<Record<string, PortalOfertaRow[]>>({});
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyProxy, setBusyProxy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [tick, setTick] = useState<number | null>(null);
  const [proxyMax, setProxyMax] = useState("");
  const [cfg, setCfg] = useState<PortalRematesConfigRow | null>(null);
  const [viewerRole, setViewerRole] = useState<string>("");

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

  const loteFromQuery = searchParams.get("lote")?.trim() ?? "";

  useEffect(() => {
    if (!loteFromQuery || !lotes.some((l) => l.id === loteFromQuery)) return;
    setActiveId(loteFromQuery);
  }, [loteFromQuery, lotes]);

  useEffect(() => {
    setTick(Date.now());
    const id = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!viewerId) return;
    const sb = createClient();
    if (!sb) return;
    void sb
      .from("profiles")
      .select("rol")
      .eq("id", viewerId)
      .maybeSingle()
      .then(({ data }) => {
        setViewerRole(String(data?.rol ?? "").toLowerCase());
      });
  }, [viewerId]);

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

    const refreshRemateAndCfg = () =>
      Promise.all([
        sb
          .from("portal_remates")
          .select("*")
          .eq("id", remate.id)
          .single(),
        sb.from("portal_remates_config").select("*").eq("id", 1).maybeSingle(),
      ]).then(([remRes, cfgRes]) => {
        if (remRes.data) setRemate(remRes.data as PortalRemateRow);
        if (cfgRes.data) setCfg(cfgRes.data as PortalRematesConfigRow);
      });
    void refreshRemateAndCfg();
    const poll = window.setInterval(() => {
      void refreshRemateAndCfg();
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
    if (["pausado", "adjudicado", "vendido", "anulado"].includes(String(active.estado ?? ""))) {
      setMsg("Este lote no está habilitado para recibir ofertas.");
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
    const hiConfirmFactor = Math.max(1, Number(cfg?.high_bid_confirm_multiplier ?? 3));
    if (monto >= minNext * hiConfirmFactor) {
      const ok = window.confirm(
        `Tu oferta ${formatClp(monto)} es alta respecto del mínimo (${formatClp(minNext)}). ¿Confirmas enviarla?`,
      );
      if (!ok) {
        setBusy(false);
        return;
      }
    }
    const clientMeta = {
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
      language: typeof navigator !== "undefined" ? navigator.language : "",
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
    const { data, error } = await sb.rpc("portal_place_bid", {
      p_lote_id: active.id,
      p_monto: monto,
      p_client_meta: clientMeta,
    });
    if (error) {
      setMsg(error.message);
      setBusy(false);
      return;
    }
    const res = data as {
      ok?: boolean;
      error?: string;
      minimo_requerido?: number;
      precio_base?: number;
      ends_at_extendido?: string | null;
    };
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
    if (res.ends_at_extendido) {
      setRemate((prev) => ({ ...prev, ends_at: res.ends_at_extendido as string }));
    }
    await loadOffers(lotes.map((l) => l.id));
    setMsg(res.ends_at_extendido ? "¡Oferta registrada! El cierre se extendió 2 minutos." : "¡Oferta registrada!");
    setBusy(false);
  }

  async function setProxyBid() {
    if (!active || !viewerId) {
      setMsg("Iniciá sesión para configurar puja automática.");
      return;
    }
    const monto = Number(proxyMax.replace(/\./g, "").replace(",", "."));
    if (!Number.isFinite(monto) || monto <= 0) {
      setMsg("Tope automático inválido.");
      return;
    }
    setBusyProxy(true);
    setMsg(null);
    const sb = createClient();
    if (!sb) {
      setMsg("Servicio no disponible.");
      setBusyProxy(false);
      return;
    }
    const { data, error } = await sb.rpc("portal_set_proxy_bid", {
      p_lote_id: active.id,
      p_max_monto: monto,
    });
    if (error) {
      setMsg(error.message);
      setBusyProxy(false);
      return;
    }
    const res = data as { ok?: boolean; error?: string } | null;
    if (!res?.ok) {
      setMsg(res?.error ?? "No se pudo guardar la puja automática.");
      setBusyProxy(false);
      return;
    }
    setProxyMax("");
    setMsg("Puja automática activada.");
    setBusyProxy(false);
  }

  const listForActive = active ? (offersByLote[active.id] ?? []).slice(0, 40) : [];
  const countdownLive =
    tick != null && remate.ends_at ? new Date(remate.ends_at).getTime() - tick : null;
  const started =
    tick != null &&
    (!remate.starts_at || new Date(remate.starts_at).getTime() <= tick);
  const remateAbierto = remate.estado === "en_curso" || remate.estado === "publicado";
  const canBid =
    viewerId &&
    remateAbierto &&
    tick != null &&
    countdownLive !== null &&
    countdownLive > 0 &&
    started;
  const lotCanBid = !!active && !["pausado", "adjudicado", "vendido", "anulado"].includes(String(active?.estado ?? ""));
  const canBidNow = canBid && lotCanBid;
  const lastWindowSeconds = cfg?.last_minutes_notice_seconds ?? 300;
  const isAdminViewer = viewerRole === "admin";

  function setQuickBid(multiplier: number) {
    const safeMult = Math.max(1, Math.round(multiplier));
    const next = minNext + Number(active?.incremento_minimo ?? 0) * (safeMult - 1);
    setAmount(String(Math.max(minNext, next)));
  }

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
        <div className="w-full shrink-0 rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm shadow-sm lg:min-w-[min(100%,24rem)] lg:max-w-2xl">
          <div className="flex flex-wrap items-center gap-x-8 gap-y-2">
            <div className="flex min-w-[8.5rem] shrink-0 flex-col leading-tight">
              <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Estado del remate</span>
              <span className="text-base font-bold capitalize text-neutral-900">
                {String(remate.estado ?? "").replaceAll("_", " ") || "—"}
              </span>
            </div>
            <span className="hidden h-8 w-px shrink-0 bg-neutral-200 sm:block" aria-hidden />
            <div className="min-w-0 flex-1 leading-tight">
              <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Cierra</span>
              <p
                className={`text-xs font-medium ${countdownLive !== null && countdownLive <= 0 ? "text-red-600" : "text-emerald-700"}`}
              >
                {countdownLive !== null && countdownLive <= 0
                  ? "Este remate ya cerró según la fecha configurada."
                  : remate.ends_at
                    ? formatClDateTime(remate.ends_at)
                    : "—"}
              </p>
            </div>
          </div>
          {!viewerId ? (
            <Link
              href={`/ingreso?redirect=/subastas/${remate.id}`}
              className="mt-2 inline-flex w-full justify-center rounded-lg bg-[#009ade]/10 px-3 py-1.5 text-xs font-bold text-[#009ade] hover:bg-[#009ade]/15 sm:w-auto sm:justify-start"
            >
              Iniciá sesión para ofertar
            </Link>
          ) : null}
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
                          fichaDisplayConfig={fichaDisplayConfig}
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
                    {!canBidNow ? (
                      <p className="mt-2 text-sm text-neutral-600">
                        {!remateAbierto
                          ? "Este remate aún no está habilitado para ofertar."
                          : !lotCanBid
                            ? "Este lote está pausado/cerrado y no recibe ofertas."
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
                        {countdownLive !== null && countdownLive > 0 && countdownLive <= lastWindowSeconds * 1000 ? (
                          <p className="mt-2 rounded-lg border border-amber-300/50 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                            Últimos minutos: una nueva oferta puede extender el cierre automáticamente.
                          </p>
                        ) : null}
                        <label className="mt-3 block text-sm text-neutral-600">
                          Monto
                          <input
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            inputMode="numeric"
                            className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-neutral-900"
                            placeholder={String(Math.ceil(minNext))}
                          />
                        </label>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => setQuickBid(1)}
                            className="rounded-md border border-neutral-300 px-2.5 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
                          >
                            Oferta mínima ({formatClp(minNext)})
                          </button>
                          <button
                            type="button"
                            onClick={() => setQuickBid(2)}
                            className="rounded-md border border-neutral-300 px-2.5 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
                          >
                            + 1 incremento
                          </button>
                          <button
                            type="button"
                            onClick={() => setQuickBid(3)}
                            className="rounded-md border border-neutral-300 px-2.5 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
                          >
                            + 2 incrementos
                          </button>
                        </div>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void placeBid()}
                          className="mt-4 w-full rounded-lg bg-gradient-to-r from-[#33C7E3] to-[#2ab0c9] py-3 text-sm font-bold text-[#0f1f2c] disabled:opacity-50"
                        >
                          {busy ? "Enviando…" : "Confirmar oferta"}
                        </button>
                        <div className="mt-4 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
                          <p className="text-xs font-semibold text-neutral-700">Puja automática (tope máximo)</p>
                          <div className="mt-2 flex gap-2">
                            <input
                              value={proxyMax}
                              onChange={(e) => setProxyMax(e.target.value)}
                              inputMode="numeric"
                              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-neutral-900"
                              placeholder="Ej: 25000000"
                            />
                            <button
                              type="button"
                              disabled={busyProxy}
                              onClick={() => void setProxyBid()}
                              className="rounded-lg border border-neutral-300 px-3 py-2 text-xs font-bold text-neutral-700 hover:bg-neutral-100 disabled:opacity-50"
                            >
                              {busyProxy ? "Guardando…" : "Activar"}
                            </button>
                          </div>
                        </div>
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
                            {isAdminViewer ? `#${String(o.user_id).slice(0, 8)}` : "oferta"}
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
