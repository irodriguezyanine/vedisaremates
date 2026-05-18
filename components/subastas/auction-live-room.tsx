"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AuctionLotesCarousel } from "@/components/subastas/auction-lotes-carousel";
import { InventarioMediaGallery } from "@/components/subastas/inventario-media-gallery";
import { InventarioFichaTecnica } from "@/components/subastas/inventario-ficha-tecnica";
import { useStyledDialogs } from "@/components/ui/use-styled-dialogs";
import { formatClp } from "@/lib/format-clp";
import type {
  InventarioRow,
  PortalLoteFavoritoRow,
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

function formatCountdown(ms: number | null): string {
  if (ms == null) return "--:--:--";
  if (ms <= 0) return "00:00:00";
  const totalSec = Math.floor(ms / 1000);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function sanitizeCurrencyInput(raw: string): string {
  return String(raw ?? "").replace(/[^\d]/g, "");
}

function formatCurrencyInput(raw: string): string {
  const digits = sanitizeCurrencyInput(raw);
  if (!digits) return "";
  const value = Number.parseInt(digits, 10);
  if (!Number.isFinite(value) || value <= 0) return "";
  return `$${value.toLocaleString("es-CL")}`;
}

function parseCurrencyInput(raw: string): number {
  const digits = sanitizeCurrencyInput(raw);
  if (!digits) return 0;
  return Number.parseInt(digits, 10);
}

type BidMsgTone = "success" | "error" | "info";

function formatBidMessage(raw: string): { text: string; tone: BidMsgTone } {
  const value = String(raw ?? "").trim();
  if (!value) return { text: "", tone: "info" };

  const map: Record<string, string> = {
    ya_eres_mejor_postor: "Ya eres el mejor postor en este lote.",
    garantia_no_habilitada: "Tu garantía aún no está habilitada para ofertar.",
    limite_frecuencia_pujas: "Superaste el límite de frecuencia de pujas por minuto.",
    lote_no_habilitado: "Este lote no está habilitado para recibir ofertas.",
    monto_invalido: "El monto ingresado no es válido.",
    remate_no_esta_en_curso: "El remate no está habilitado para ofertar.",
    remate_ya_finalizo: "Este remate ya finalizó.",
    remate_aun_no_inicia: "El remate aún no inicia.",
    monto_menor_al_precio_minimo_remate: "La oferta está por debajo del precio mínimo remate.",
    debes_iniciar_sesion: "Debes iniciar sesión para ofertar.",
    remate_no_disponible: "El remate no está disponible en este momento.",
    lote_no_existe: "El lote seleccionado no existe.",
  };

  let text = value;
  for (const [code, label] of Object.entries(map)) {
    if (value === code || value.startsWith(`${code} `)) {
      text = value.replace(code, label);
      break;
    }
  }

  if (text === value && text.includes("_")) {
    text = text.replaceAll("_", " ");
    text = text.charAt(0).toUpperCase() + text.slice(1);
  }

  const lower = text.toLowerCase();
  const tone: BidMsgTone =
    lower.includes("registrada") || lower.includes("activada")
      ? "success"
      : lower.includes("no ") ||
          lower.includes("error") ||
          lower.includes("invál") ||
          lower.includes("inval") ||
          lower.includes("límite") ||
          lower.includes("limite")
        ? "error"
        : "info";

  return { text, tone };
}

type Props = {
  initialRemate: PortalRemateRow;
  initialLotes: Lote[];
  viewerId?: string | null;
  viewerHasGarantia?: boolean;
  fichaDisplayConfig?: unknown | null;
  /** Lote activo inicial (ej. viene de ?lote= al abrir desde el catálogo de fotos). */
  initialActiveLoteId?: string | null;
};

export function AuctionLiveRoom({
  initialRemate,
  initialLotes,
  viewerId,
  viewerHasGarantia = false,
  fichaDisplayConfig,
  initialActiveLoteId = null,
}: Props) {
  const { confirm, dialogElement } = useStyledDialogs();
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
  const [viewerHasGarantiaLive, setViewerHasGarantiaLive] = useState<boolean>(viewerHasGarantia);
  const [favoriteLoteIds, setFavoriteLoteIds] = useState<Set<string>>(new Set());
  const [compareLoteIds, setCompareLoteIds] = useState<Set<string>>(new Set());
  const [quickCustomIncrements, setQuickCustomIncrements] = useState("3");
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [roomView, setRoomView] = useState<"compacta" | "detallada">("detallada");
  const lastSoundBucketRef = useRef<number | null>(null);

  const active = useMemo(() => lotes.find((l) => l.id === activeId) ?? null, [lotes, activeId]);
  const lotesById = useMemo(() => new Map(lotes.map((l) => [l.id, l])), [lotes]);

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
    setViewerHasGarantiaLive(Boolean(viewerHasGarantia));
  }, [viewerHasGarantia]);

  useEffect(() => {
    if (!viewerId) {
      setViewerHasGarantiaLive(false);
      return;
    }
    const sb = createClient();
    if (!sb) return;

    let cancelled = false;
    const refreshGarantia = async () => {
      const { data } = await sb
        .from("profiles")
        .select("garantia_aprobada")
        .eq("id", viewerId)
        .maybeSingle();
      if (!cancelled) {
        setViewerHasGarantiaLive(data?.garantia_aprobada === true);
      }
    };

    void refreshGarantia();
    const pollId = window.setInterval(() => {
      void refreshGarantia();
    }, 15000);

    return () => {
      cancelled = true;
      window.clearInterval(pollId);
    };
  }, [viewerId]);

  useEffect(() => {
    if (!viewerId || !lotes.length) {
      setFavoriteLoteIds(new Set());
      return;
    }
    const sb = createClient();
    if (!sb) return;
    const loteIds = lotes.map((l) => l.id);
    void sb
      .from("portal_lote_favoritos")
      .select("lote_id")
      .eq("user_id", viewerId)
      .in("lote_id", loteIds)
      .then(({ data }) => {
        const set = new Set<string>();
        for (const row of (data ?? []) as Pick<PortalLoteFavoritoRow, "lote_id">[]) {
          if (row?.lote_id) set.add(row.lote_id);
        }
        setFavoriteLoteIds(set);
      });
  }, [viewerId, lotes]);

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
    const floor = Number(active.precio_minimo_remate ?? 0) || 0;
    const list = offersByLote[active.id] ?? [];
    const max = list.length ? list[0]!.monto : null;
    if (max === null) return Math.max(Number(active.precio_base) || 0, floor);
    return Math.max(max + Number(active.incremento_minimo), floor);
  }, [active, offersByLote]);
  const listForActive = active ? (offersByLote[active.id] ?? []).slice(0, 40) : [];
  const topForActive = listForActive[0] ?? null;
  const viewerHasBidInActive = !!(viewerId && listForActive.some((o) => o.user_id === viewerId));
  const viewerIsTopBidder = !!(viewerId && topForActive && topForActive.user_id === viewerId);

  async function placeBid() {
    if (!active || !viewerId) {
      setMsg("Inicie sesión para ofertar.");
      return;
    }
    if (["pausado", "adjudicado", "vendido", "anulado"].includes(String(active.estado ?? ""))) {
      setMsg("Este lote no está habilitado para recibir ofertas.");
      return;
    }
    setBusy(true);
    setMsg(null);
    const monto = parseCurrencyInput(amount);
    if (!Number.isFinite(monto) || monto <= 0) {
      setMsg("Monto inválido.");
      setBusy(false);
      return;
    }
    const sb = createClient();
    if (!sb) {
      setMsg("No se pudo iniciar la conexión. Actualice la página o intente más tarde.");
      setBusy(false);
      return;
    }
    const hiConfirmFactor = Math.max(1, Number(cfg?.high_bid_confirm_multiplier ?? 3));
    const summaryMsg = [
      "Confirme su oferta",
      "",
      `Monto a ofertar: ${formatClp(monto)}`,
      `Mínimo sugerido: ${formatClp(minNext)}`,
      topForActive ? `Oferta líder actual: ${formatClp(topForActive.monto)}` : "Aún no hay oferta líder.",
    ].join("\n");
    const confirmBid = await confirm({
      title: "Confirme su oferta",
      message: summaryMsg.replace("Confirme su oferta\n\n", ""),
      confirmText: "Confirmar oferta",
      cancelText: "Cancelar",
    });
    if (!confirmBid) {
      setBusy(false);
      return;
    }
    if (monto >= minNext * hiConfirmFactor) {
      const ok = await confirm({
        title: "Oferta alta",
        message: `Tu oferta ${formatClp(monto)} es alta respecto del mínimo (${formatClp(minNext)}).\n¿Confirmas enviarla?`,
        confirmText: "Sí, enviar",
        cancelText: "Revisar",
      });
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
      setMsg("Inicie sesión para configurar puja automática.");
      return;
    }
    const monto = parseCurrencyInput(proxyMax);
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

  const countdownLive =
    tick != null && remate.ends_at ? new Date(remate.ends_at).getTime() - tick : null;
  const countdownText = formatCountdown(countdownLive);
  const isLastTenMinutes = countdownLive != null && countdownLive > 0 && countdownLive <= 10 * 60 * 1000;
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
  const bidMsg = msg ? formatBidMessage(msg) : null;
  const customQuick = Math.max(1, Math.min(20, Number(quickCustomIncrements) || 1));

  useEffect(() => {
    if (!soundEnabled || !isLastTenMinutes || countdownLive == null || countdownLive <= 0) return;
    const bucket = Math.floor(countdownLive / 60000);
    if (bucket === lastSoundBucketRef.current) return;
    lastSoundBucketRef.current = bucket;
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.value = 0.02;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      window.setTimeout(() => {
        osc.stop();
        void ctx.close();
      }, 140);
    } catch {
      // Ignorar si el navegador bloquea autoplay de audio.
    }
  }, [soundEnabled, isLastTenMinutes, countdownLive]);

  function setQuickBid(multiplier: number) {
    const safeMult = Math.max(1, Math.round(multiplier));
    const next = minNext + Number(active?.incremento_minimo ?? 0) * (safeMult - 1);
    setAmount(formatCurrencyInput(String(Math.max(minNext, next))));
  }

  async function toggleFavorite(loteId: string) {
    if (!viewerId) {
      setMsg("Inicia sesión para guardar favoritos.");
      return;
    }
    const sb = createClient();
    if (!sb) return;
    const isFav = favoriteLoteIds.has(loteId);
    if (isFav) {
      await sb.from("portal_lote_favoritos").delete().eq("user_id", viewerId).eq("lote_id", loteId);
      setFavoriteLoteIds((prev) => {
        const next = new Set(prev);
        next.delete(loteId);
        return next;
      });
      return;
    }
    const { error } = await sb.from("portal_lote_favoritos").upsert({ user_id: viewerId, lote_id: loteId, notify_email: true });
    if (!error) {
      setFavoriteLoteIds((prev) => {
        const next = new Set(prev);
        next.add(loteId);
        return next;
      });
    }
  }

  function toggleCompare(loteId: string) {
    setCompareLoteIds((prev) => {
      const next = new Set(prev);
      if (next.has(loteId)) {
        next.delete(loteId);
        return next;
      }
      if (next.size >= 3) return prev;
      next.add(loteId);
      return next;
    });
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
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-neutral-500">Vista de sala:</span>
            <button
              type="button"
              onClick={() => setRoomView("detallada")}
              className={`rounded-md border px-2 py-1 text-xs font-semibold ${
                roomView === "detallada"
                  ? "border-[#009ade]/40 bg-[#009ade]/10 text-[#006a98]"
                  : "border-neutral-300 text-neutral-600 hover:bg-neutral-50"
              }`}
            >
              Detallada
            </button>
            <button
              type="button"
              onClick={() => setRoomView("compacta")}
              className={`rounded-md border px-2 py-1 text-xs font-semibold ${
                roomView === "compacta"
                  ? "border-[#009ade]/40 bg-[#009ade]/10 text-[#006a98]"
                  : "border-neutral-300 text-neutral-600 hover:bg-neutral-50"
              }`}
            >
              Compacta
            </button>
          </div>
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
            <span className="hidden h-8 w-px shrink-0 bg-neutral-200 xl:block" aria-hidden />
            <div
              className={`min-w-[11rem] rounded-xl border px-3 py-2 text-center xl:text-left ${
                isLastTenMinutes
                  ? "border-rose-300 bg-rose-50 shadow-[0_0_0_1px_rgba(244,63,94,0.12)] animate-pulse"
                  : "border-sky-200 bg-sky-50"
              }`}
            >
              <span
                className={`text-[10px] font-bold uppercase tracking-wider ${
                  isLastTenMinutes ? "text-rose-700" : "text-sky-700"
                }`}
              >
                Cuenta regresiva
              </span>
              <p
                className={`mt-0.5 font-mono text-lg font-black tabular-nums ${
                  isLastTenMinutes ? "text-rose-700" : "text-sky-800"
                }`}
              >
                {countdownText}
              </p>
              {isLastTenMinutes ? (
                <p className="text-[10px] font-semibold text-rose-700">Alerta activa: últimos 10 minutos</p>
              ) : null}
            </div>
          </div>
          {!viewerId ? (
            <Link
              href={`/ingreso?redirect=/subastas/${remate.id}`}
              className="mt-2 inline-flex w-full justify-center rounded-lg bg-[#009ade]/10 px-3 py-1.5 text-xs font-bold text-[#009ade] hover:bg-[#009ade]/15 sm:w-auto sm:justify-start"
            >
              Inicie sesión para ofertar
            </Link>
          ) : null}
        </div>
      </div>

      {lotes.length === 0 ? (
        <p className="text-neutral-600">Este remate aún no tiene lotes publicados.</p>
      ) : (
        <div className="space-y-5 sm:space-y-6">
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

                    {active.inventario && roomView === "detallada" ? (
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
                  {viewerId ? (
                    <div
                      className={`rounded-2xl border p-4 shadow-sm ${
                        viewerIsTopBidder
                          ? "border-emerald-200 bg-emerald-50"
                          : viewerHasBidInActive
                            ? "border-rose-200 bg-rose-50"
                            : "border-neutral-200 bg-white"
                      }`}
                    >
                      <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">Estado de su puja</p>
                      {viewerIsTopBidder ? (
                        <>
                          <p className="mt-1 text-sm font-bold text-emerald-800">Usted es el mejor postor</p>
                          {topForActive ? <p className="mt-1 text-xs text-emerald-700">Monto líder: {formatClp(topForActive.monto)}</p> : null}
                        </>
                      ) : viewerHasBidInActive ? (
                        <>
                          <p className="mt-1 text-sm font-bold text-rose-700">Usted fue sobrepasado</p>
                          <p className="mt-1 text-xs text-rose-700">Sugerencia automática: {formatClp(minNext)}</p>
                          <button
                            type="button"
                            onClick={() => setAmount(formatCurrencyInput(String(minNext)))}
                            className="mt-2 rounded-md border border-rose-300 bg-white px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                          >
                            Usar sugerencia
                          </button>
                        </>
                      ) : (
                        <p className="mt-1 text-sm text-neutral-600">Aún no tiene ofertas en este lote.</p>
                      )}
                    </div>
                  ) : null}

                  <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm ring-1 ring-neutral-100/80">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">Precios del lote</p>
                    <p className="mt-2 text-2xl font-black tabular-nums text-neutral-900">{formatClp(active.precio_base)}</p>
                    <p className="mt-1 text-xs text-neutral-600">Precio base publicado</p>
                    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-600">Precio mínimo remate</p>
                      <p className="mt-1 text-sm font-bold text-slate-800">{formatClp(active.precio_minimo_remate ?? active.precio_base)}</p>
                    </div>
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
                                ? "Inicie sesión para ofertar."
                                : remate.starts_at && new Date(remate.starts_at).getTime() > tick
                                  ? "Esperando la hora de inicio."
                                  : "No puede ofertar en este momento."}
                      </p>
                    ) : (
                      <>
                        {!viewerHasGarantiaLive ? (
                          <p className="mt-2 rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                            Si tu garantía fue aprobada recientemente, puedes intentar ofertar. La validación final se realiza al enviar la puja.
                          </p>
                        ) : null}
                        {countdownLive !== null && countdownLive > 0 && countdownLive <= lastWindowSeconds * 1000 ? (
                          <p className="mt-2 rounded-lg border border-amber-300/50 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                            Últimos minutos: una nueva oferta puede extender el cierre automáticamente.
                          </p>
                        ) : null}
                        <label className="mt-3 block text-sm text-neutral-600">
                          Monto
                          <input
                            value={amount}
                            onChange={(e) => setAmount(formatCurrencyInput(e.target.value))}
                            inputMode="numeric"
                            className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-neutral-900"
                            placeholder={formatCurrencyInput(String(Math.ceil(minNext))) || "$0"}
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
                          <button
                            type="button"
                            onClick={() => setQuickBid(customQuick)}
                            className="rounded-md border border-[#009ade]/30 bg-[#009ade]/10 px-2.5 py-1.5 text-xs font-semibold text-[#006a98] hover:bg-[#009ade]/15"
                          >
                            + {customQuick - 1} incrementos (personalizado)
                          </button>
                        </div>
                        <label className="mt-2 block text-xs text-neutral-600">
                          Oferta rápida personalizada (cantidad de incrementos)
                          <input
                            value={quickCustomIncrements}
                            onChange={(e) => setQuickCustomIncrements(e.target.value)}
                            inputMode="numeric"
                            className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-neutral-900"
                            placeholder="Ej: 4"
                          />
                        </label>
                        <label className="mt-2 inline-flex items-center gap-2 text-xs text-neutral-600">
                          <input
                            type="checkbox"
                            checked={soundEnabled}
                            onChange={(e) => setSoundEnabled(e.target.checked)}
                            className="h-4 w-4 rounded border-neutral-300 text-[#009ade] focus:ring-[#009ade]"
                          />
                          Activar alerta sonora en últimos minutos
                        </label>
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
                              onChange={(e) => setProxyMax(formatCurrencyInput(e.target.value))}
                              inputMode="numeric"
                              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-neutral-900"
                              placeholder="$25.000.000"
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
                  {bidMsg ? (
                    <div
                      className={`mt-3 inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${
                        bidMsg.tone === "success"
                          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                          : bidMsg.tone === "error"
                            ? "border-rose-200 bg-rose-50 text-rose-700"
                            : "border-sky-200 bg-sky-50 text-sky-700"
                      }`}
                    >
                      {bidMsg.text}
                    </div>
                  ) : null}
                  </div>

                  {roomView === "detallada" ? (
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
                          <span className="text-[10px] text-neutral-400">oferta</span>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
                  ) : null}
              </aside>
            </div>

              {compareLoteIds.size > 0 ? (
                <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-lg font-bold text-neutral-900">Comparador de lotes ({compareLoteIds.size}/3)</h3>
                    <button
                      type="button"
                      onClick={() => setCompareLoteIds(new Set())}
                      className="rounded-md border border-neutral-300 px-2 py-1 text-xs font-semibold text-neutral-600 hover:bg-neutral-50"
                    >
                      Limpiar
                    </button>
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-3">
                    {[...compareLoteIds].map((id) => {
                      const row = lotesById.get(id);
                      if (!row) return null;
                      const inv = row.inventario;
                      const currentMax = (offersByLote[id]?.[0]?.monto ?? null) as number | null;
                      const nextMin = currentMax == null ? Number(row.precio_base) : currentMax + Number(row.incremento_minimo);
                      return (
                        <article key={id} className="rounded-xl border border-neutral-200 bg-neutral-50/70 p-3">
                          <p className="line-clamp-2 text-sm font-bold text-neutral-900">
                            {[inv?.marca, inv?.modelo].filter(Boolean).join(" ") || row.titulo || "Lote"}
                          </p>
                          <p className="mt-1 text-xs text-neutral-500">
                            {[inv?.patente, inv?.ano ? String(inv.ano) : null, inv?.categoria].filter(Boolean).join(" · ") || "Sin detalle"}
                          </p>
                          <div className="mt-2 text-xs text-neutral-700">
                            <p>
                              Base: <strong>{formatClp(row.precio_base)}</strong>
                            </p>
                            <p>
                              Sig. mínima: <strong>{formatClp(nextMin)}</strong>
                            </p>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </section>
              ) : null}

              <AuctionLotesCarousel
                compact={roomView === "compacta"}
                lotes={lotes}
                activeId={activeId}
                onSelect={setActiveId}
                favoriteLoteIds={favoriteLoteIds}
                onToggleFavorite={toggleFavorite}
                compareLoteIds={compareLoteIds}
                onToggleCompare={toggleCompare}
              />
            </>
          ) : null}
        </div>
      )}
      {dialogElement}
    </div>
  );
}
