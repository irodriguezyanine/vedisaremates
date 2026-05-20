"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ShareIconMenuButton } from "@/components/share-icon-menu-button";
import { AuctionLotesCarousel } from "@/components/subastas/auction-lotes-carousel";
import { InventarioMediaGallery } from "@/components/subastas/inventario-media-gallery";
import { InventarioFichaTecnica } from "@/components/subastas/inventario-ficha-tecnica";
import { useStyledDialogs } from "@/components/ui/use-styled-dialogs";
import { formatClp } from "@/lib/format-clp";
import { resolveAvaluoFiscalMonto } from "@/lib/tasaciones-avaluo-fiscal";
import type {
  InventarioRow,
  PortalLoteFavoritoRow,
  PortalOfertaRow,
  PortalRemateLoteRow,
  PortalRemateRow,
  PortalRematesConfigRow,
} from "@/lib/portal-types";
import { createClient } from "@/lib/supabase/client";

type Lote = PortalRemateLoteRow & {
  inventario: InventarioRow | null;
  avaluo_fiscal_monto?: number | null;
  tasaciones_remate_item_id?: string | null;
};

const TZ_CHILE = { timeZone: "America/Santiago" } satisfies Intl.DateTimeFormatOptions;

function formatClDateParts(iso: string | null): { date: string; time: string } {
  if (!iso) return { date: "No definido", time: "" };
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return { date: "No definido", time: "" };
  return {
    date: value
      .toLocaleDateString("es-CL", { ...TZ_CHILE, day: "2-digit", month: "2-digit", year: "numeric" })
      .replaceAll("/", "-"),
    time: value.toLocaleTimeString("es-CL", { ...TZ_CHILE, hour: "2-digit", minute: "2-digit" }),
  };
}

function formatClTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-CL", TZ_CHILE);
}

function formatSecondsLabel(totalSeconds: number): string {
  const safe = Math.max(0, Math.round(totalSeconds));
  if (safe === 0) return "0 segundos";
  if (safe % 60 === 0) {
    const mins = safe / 60;
    return mins === 1 ? "1 minuto" : `${mins} minutos`;
  }
  return safe === 1 ? "1 segundo" : `${safe} segundos`;
}

function normalizeRole(role: string): string {
  return String(role ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s_-]+/g, "");
}

function isClienteRemateRole(role: string): boolean {
  const value = normalizeRole(role);
  return value.includes("clienteremate");
}

function isAdminLikeRole(role: string): boolean {
  const value = normalizeRole(role);
  return ["admin", "administrador", "superadmin", "sac", "staff", "operador"].some((token) =>
    value.includes(token),
  );
}

function formatOfferUserName(
  row: Pick<PortalOfertaRow, "user_id">,
  namesById: Record<string, string>,
): string {
  const userId = String(row.user_id ?? "").trim();
  if (!userId) return "Usuario";
  const fromMap = String(namesById[userId] ?? "").trim();
  if (fromMap) return fromMap;
  return `Usuario ${userId.slice(0, 8)}`;
}

type OfferUserCard = {
  id?: string | null;
  email?: string | null;
  username?: string | null;
  nombre?: string | null;
  apellido?: string | null;
  rut?: string | null;
  telefono?: string | null;
  empresa?: string | null;
};

type LiveNotice = {
  id: string;
  tone: "info" | "warning";
  title: string;
  detail: string;
};

const OFFERS_FALLBACK_POLL_MS = 5000;
const GASTOS_OPERACIONALES_CLP = 190000;

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

function incrementoAutomaticoPorRango(precioReferencia: number): number {
  const v = Number.isFinite(precioReferencia) ? Math.max(0, precioReferencia) : 0;
  if (v <= 100000) return 10000;
  if (v <= 1000000) return 50000;
  if (v <= 4000000) return 100000;
  if (v <= 8000000) return 200000;
  if (v <= 15000000) return 300000;
  return 400000;
}

function incrementoPorLote(lote: Pick<PortalRemateLoteRow, "precio_base" | "precio_minimo_remate"> | null): number {
  if (!lote) return 10000;
  const referencia = Math.max(Number(lote.precio_minimo_remate ?? 0), Number(lote.precio_base ?? 0), 0);
  return incrementoAutomaticoPorRango(referencia);
}

function getLeadingOffer(list: PortalOfertaRow[]): PortalOfertaRow | null {
  if (!list.length) return null;
  return [...list].sort((a, b) => b.monto - a.monto || new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0] ?? null;
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
  const [offerUserNamesById, setOfferUserNamesById] = useState<Record<string, string>>({});
  const [offerUserCardsById, setOfferUserCardsById] = useState<Record<string, OfferUserCard>>({});
  const [openOfferUserId, setOpenOfferUserId] = useState<string | null>(null);
  const [loadingOfferUserId, setLoadingOfferUserId] = useState<string | null>(null);
  const [offerUserCardError, setOfferUserCardError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyProxy, setBusyProxy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [tick, setTick] = useState<number | null>(null);
  const [proxyMax, setProxyMax] = useState("");
  const [customBidAmount, setCustomBidAmount] = useState("");
  const [cfg, setCfg] = useState<PortalRematesConfigRow | null>(null);
  const [viewerRole, setViewerRole] = useState<string>("");
  const [favoriteLoteIds, setFavoriteLoteIds] = useState<Set<string>>(new Set());
  const [compareLoteIds, setCompareLoteIds] = useState<Set<string>>(new Set());
  const [roomView, setRoomView] = useState<"compacta" | "detallada">("detallada");
  const [liveNotices, setLiveNotices] = useState<LiveNotice[]>([]);
  const [avaluoFiscalActivo, setAvaluoFiscalActivo] = useState<number | null>(null);
  const lastTopOfferByLoteRef = useRef<Record<string, { id: string; userId: string | null; monto: number }>>({});

  const active = useMemo(() => lotes.find((l) => l.id === activeId) ?? null, [lotes, activeId]);
  const lotesById = useMemo(() => new Map(lotes.map((l) => [l.id, l])), [lotes]);

  const pushLiveNotice = useCallback((tone: LiveNotice["tone"], title: string, detail: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setLiveNotices((prev) => {
      const next = [...prev, { id, tone, title, detail }];
      return next.slice(-4);
    });
    window.setTimeout(() => {
      setLiveNotices((prev) => prev.filter((n) => n.id !== id));
    }, 6500);
  }, []);

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

      const userIds = [...new Set((data as PortalOfertaRow[]).map((row) => String(row.user_id ?? "").trim()).filter(Boolean))];
      if (!userIds.length) return;

      const { data: profileRows } = await sb
        .from("profiles")
        .select("id,username,nombre,apellido")
        .in("id", userIds);
      if (!profileRows) return;

      const resolved: Record<string, string> = {};
      for (const profile of profileRows as Array<{
        id?: string | null;
        username?: string | null;
        nombre?: string | null;
        apellido?: string | null;
      }>) {
        const id = String(profile.id ?? "").trim();
        if (!id) continue;
        const username = String(profile.username ?? "").trim();
        const nombre = String(profile.nombre ?? "").trim();
        const apellido = String(profile.apellido ?? "").trim();
        const fullName = [nombre, apellido].filter(Boolean).join(" ").trim();
        const display = username || fullName;
        if (display) {
          resolved[id] = display;
        }
      }
      if (Object.keys(resolved).length > 0) {
        setOfferUserNamesById((prev) => ({ ...prev, ...resolved }));
      }
    },
    [],
  );

  const loadOfferUserCard = useCallback(
    async (userId: string) => {
      const targetId = String(userId ?? "").trim();
      if (!targetId) return;
      if (offerUserCardsById[targetId]) return;

      const sb = createClient();
      if (!sb) return;

      setOfferUserCardError(null);
      setLoadingOfferUserId(targetId);
      try {
        const { data, error } = await sb.rpc("portal_admin_get_usuario_detalle", { p_user_id: targetId });
        const res = data as
          | {
              ok?: boolean;
              error?: string;
              user?: {
                id?: string | null;
                email?: string | null;
                username?: string | null;
                nombre?: string | null;
                apellido?: string | null;
                rut?: string | null;
                telefono?: string | null;
                empresa?: string | null;
              };
            }
          | null;
        if (error || !res?.ok || !res.user) {
          setOfferUserCardError("No pudimos cargar el detalle del usuario.");
          return;
        }
        const parsed: OfferUserCard = {
          id: res.user.id ?? null,
          email: res.user.email ?? null,
          username: res.user.username ?? null,
          nombre: res.user.nombre ?? null,
          apellido: res.user.apellido ?? null,
          rut: res.user.rut ?? null,
          telefono: res.user.telefono ?? null,
          empresa: res.user.empresa ?? null,
        };
        setOfferUserCardsById((prev) => ({ ...prev, [targetId]: parsed }));
      } catch {
        setOfferUserCardError("No pudimos cargar el detalle del usuario.");
      } finally {
        setLoadingOfferUserId((curr) => (curr === targetId ? null : curr));
      }
    },
    [offerUserCardsById],
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
    const rematePoll = window.setInterval(() => {
      void refreshRemateAndCfg();
    }, 10000);
    const offersPoll = window.setInterval(() => {
      void loadOffers(ids);
    }, OFFERS_FALLBACK_POLL_MS);

    return () => {
      void sb.removeChannel(ch);
      window.clearInterval(rematePoll);
      window.clearInterval(offersPoll);
    };
  }, [lotes, remate.id, loadOffers]);

  const minNext = useMemo(() => {
    if (!active) return 0;
    const floor = Number(active.precio_minimo_remate ?? 0) || 0;
    const list = offersByLote[active.id] ?? [];
    const max = getLeadingOffer(list)?.monto ?? null;
    const incremento = incrementoPorLote(active);
    if (max === null) return Math.max(Number(active.precio_base) || 0, floor);
    return Math.max(max + incremento, floor);
  }, [active, offersByLote]);
  const listForActive = active ? (offersByLote[active.id] ?? []).slice(0, 40) : [];
  const topForActive = useMemo(() => getLeadingOffer(active ? offersByLote[active.id] ?? [] : []), [active, offersByLote]);
  const lotPriceDisplay = topForActive ? Number(topForActive.monto ?? 0) : Number(active?.precio_base ?? 0);
  const lotPriceLabel = topForActive ? "Oferta líder actual" : "Precio base publicado";
  const customBidMonto = parseCurrencyInput(customBidAmount);
  const ofertaReferencia = customBidMonto > 0 ? customBidMonto : Math.max(0, Math.round(minNext));
  const detalleComision = Math.round(ofertaReferencia * 0.12);
  const detalleIvaComision = Math.round(detalleComision * 0.19);
  const detalleAvaluoFiscal = avaluoFiscalActivo;
  const detalleImpuestoTransferencia =
    detalleAvaluoFiscal != null ? Math.round(detalleAvaluoFiscal * 0.015) : null;
  const detalleTotalPagar =
    detalleImpuestoTransferencia != null
      ? ofertaReferencia + detalleComision + detalleIvaComision + GASTOS_OPERACIONALES_CLP + detalleImpuestoTransferencia
      : null;
  const viewerHasBidInActive = !!(viewerId && listForActive.some((o) => o.user_id === viewerId));
  const viewerIsTopBidder = !!(viewerId && topForActive && topForActive.user_id === viewerId);
  const topBidderUsername = topForActive ? formatOfferUserName(topForActive, offerUserNamesById) : null;

  useEffect(() => {
    if (!active) {
      setAvaluoFiscalActivo(null);
      return;
    }
    if (active.avaluo_fiscal_monto != null && active.avaluo_fiscal_monto > 0) {
      setAvaluoFiscalActivo(active.avaluo_fiscal_monto);
      return;
    }

    let cancelled = false;
    const loadAvaluo = async () => {
      const inventarioRow = active.inventario as Record<string, unknown> | null;
      let remateItemExtra: unknown = null;
      const tasacionesItemId = String(active.tasaciones_remate_item_id ?? "").trim();
      if (tasacionesItemId) {
        const sb = createClient();
        if (sb) {
          const { data } = await sb
            .from("remates_items")
            .select("extra_fields")
            .eq("id", tasacionesItemId)
            .maybeSingle();
          remateItemExtra = (data as { extra_fields?: unknown } | null)?.extra_fields ?? null;
        }
      }
      if (!cancelled) {
        setAvaluoFiscalActivo(
          resolveAvaluoFiscalMonto({
            remateItemExtraFields: remateItemExtra,
            inventario: inventarioRow,
          }),
        );
      }
    };
    void loadAvaluo();
    return () => {
      cancelled = true;
    };
  }, [active]);

  useEffect(() => {
    if (!active?.id || !topForActive) return;
    const prev = lastTopOfferByLoteRef.current[active.id];
    const current = {
      id: String(topForActive.id),
      userId: String(topForActive.user_id ?? "").trim() || null,
      monto: Number(topForActive.monto ?? 0),
    };

    if (!prev) {
      lastTopOfferByLoteRef.current[active.id] = current;
      return;
    }

    if (prev.id !== current.id) {
      if (viewerId && prev.userId === viewerId && current.userId !== viewerId) {
        pushLiveNotice("warning", "Tu oferta fue superada", `Nueva oferta líder: ${formatClp(current.monto)}.`);
      } else if (!viewerId || current.userId !== viewerId) {
        pushLiveNotice("info", "Nueva oferta líder", `Oferta actual: ${formatClp(current.monto)}.`);
      }
    }

    lastTopOfferByLoteRef.current[active.id] = current;
  }, [active?.id, topForActive, viewerId, pushLiveNotice]);

  async function placeBidAmount(rawMonto: number, origen: "minima" | "personalizada") {
    if (!active || !viewerId) {
      setMsg("Inicie sesión para ofertar.");
      return;
    }
    if (["pausado", "adjudicado", "vendido", "anulado"].includes(String(active.estado ?? ""))) {
      setMsg("Este lote no está habilitado para recibir ofertas.");
      return;
    }
    const monto = Math.max(0, Math.round(rawMonto));
    if (!Number.isFinite(monto) || monto <= 0) {
      setMsg("Monto inválido.");
      return;
    }
    if (origen === "personalizada" && monto < minNext) {
      setMsg(`La oferta personalizada debe ser al menos ${formatClp(minNext)}.`);
      return;
    }
    setBusy(true);
    setMsg(null);
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
      origen === "personalizada" ? "Origen: oferta personalizada" : "Origen: oferta mínima",
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
    if (res.ends_at_extendido) {
      setRemate((prev) => ({ ...prev, ends_at: res.ends_at_extendido as string }));
    }
    if (origen === "personalizada") {
      setCustomBidAmount("");
    }
    await loadOffers(lotes.map((l) => l.id));
    const extendSeconds = Math.max(0, Number(cfg?.anti_sniping_extend_seconds ?? 90));
    setMsg(
      res.ends_at_extendido
        ? `¡Oferta registrada! El cierre se extendió ${formatSecondsLabel(extendSeconds)}.`
        : "¡Oferta registrada!",
    );
    void fetch("/api/notifications/remate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "post_bid",
        loteId: active.id,
        monto,
      }),
    }).catch(() => null);
    setBusy(false);
  }

  async function placeMinimumBid() {
    await placeBidAmount(minNext, "minima");
  }

  async function placeCustomBid() {
    await placeBidAmount(customBidMonto, "personalizada");
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
    const approve = await confirm({
      title: "Confirmar puja automática",
      message: `Se activará puja automática con tope máximo ${formatClp(monto)}.\n¿Deseas continuar?`,
      confirmText: "Sí, activar",
      cancelText: "Cancelar",
    });
    if (!approve) return;
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
  const bidMsg = msg ? formatBidMessage(msg) : null;
  const viewerOffersOnlyMode =
    !!viewerId && isAdminLikeRole(viewerRole) && !isClienteRemateRole(viewerRole);
  const viewerIsClienteRemate = !!viewerId && isClienteRemateRole(viewerRole);
  const showOnlyOffersCount = !viewerId;
  const showPublicOfferSummary = !viewerOffersOnlyMode;
  const startsAtDisplay = useMemo(() => formatClDateParts(remate.starts_at), [remate.starts_at]);
  const endsAtDisplay = useMemo(() => formatClDateParts(remate.ends_at), [remate.ends_at]);
  const remateStatusLabel = useMemo(
    () => String(remate.estado ?? "").replaceAll("_", " ") || "—",
    [remate.estado],
  );

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
        <div className="w-full shrink-0 rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-slate-50/40 to-sky-50/30 p-4 text-sm shadow-[0_10px_28px_rgba(15,61,92,0.08)] lg:min-w-[min(100%,24rem)] lg:max-w-2xl">
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Estado del remate</span>
              <p className="mt-1 text-2xl font-black capitalize leading-none text-neutral-900">{remateStatusLabel}</p>
            </div>
            <div className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-sky-700">Inicio</span>
              <p className="mt-1 text-lg font-black leading-none text-sky-800">{startsAtDisplay.date}</p>
              <p className="mt-1 text-xs font-semibold tabular-nums text-sky-700">{startsAtDisplay.time || "Sin hora"}</p>
            </div>
            <div
              className={`rounded-xl border px-3 py-2.5 ${
                countdownLive !== null && countdownLive <= 0
                  ? "border-rose-200 bg-rose-50"
                  : "border-emerald-200 bg-emerald-50"
              }`}
            >
              <span
                className={`text-[10px] font-bold uppercase tracking-wider ${
                  countdownLive !== null && countdownLive <= 0 ? "text-rose-700" : "text-emerald-700"
                }`}
              >
                Cierra
              </span>
              <p
                className={`mt-1 text-lg font-black leading-none ${
                  countdownLive !== null && countdownLive <= 0 ? "text-rose-800" : "text-emerald-800"
                }`}
              >
                {endsAtDisplay.date}
              </p>
              <p
                className={`mt-1 text-xs font-semibold tabular-nums ${
                  countdownLive !== null && countdownLive <= 0 ? "text-rose-700" : "text-emerald-700"
                }`}
              >
                {countdownLive !== null && countdownLive <= 0 ? "Cerrado" : endsAtDisplay.time || "Sin hora"}
              </p>
            </div>
            <div
              className={`rounded-xl border px-3 py-2.5 ${
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
                className={`mt-1 font-mono text-2xl font-black tabular-nums leading-none ${
                  isLastTenMinutes ? "text-rose-700" : "text-sky-800"
                }`}
              >
                {countdownText}
              </p>
              {isLastTenMinutes ? (
                <p className="mt-1 text-[10px] font-semibold text-rose-700">Alerta activa: últimos 10 minutos</p>
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

      {liveNotices.length ? (
        <div className="fixed right-3 top-20 z-50 flex w-[min(92vw,22rem)] flex-col gap-2 sm:right-5">
          {liveNotices.map((notice) => (
            <div
              key={notice.id}
              className={`rounded-xl border px-3 py-2.5 shadow-lg backdrop-blur ${
                notice.tone === "warning"
                  ? "border-rose-300 bg-rose-50/95 text-rose-900"
                  : "border-sky-300 bg-sky-50/95 text-sky-900"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-extrabold">{notice.title}</p>
                  <p className="mt-0.5 text-xs font-semibold">{notice.detail}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setLiveNotices((prev) => prev.filter((n) => n.id !== notice.id))}
                  className="rounded-md border border-current/30 px-1.5 py-0.5 text-[11px] font-bold opacity-80 hover:opacity-100"
                  aria-label="Cerrar notificación"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {lotes.length === 0 ? (
        <p className="text-neutral-600">Este remate aún no tiene lotes publicados.</p>
      ) : (
        <div className="space-y-5 sm:space-y-6">
          {active ? (
            <>
              <div className="space-y-1 border-b border-neutral-100 pb-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <h2 className="text-pretty min-w-0 flex-1 text-2xl font-black tracking-tight text-neutral-900 sm:text-3xl">
                    {active.inventario
                      ? [active.inventario.marca, active.inventario.modelo].filter(Boolean).join(" ") ||
                        (active.titulo ?? "Vehículo")
                      : (active.titulo ?? "Detalle del lote")}
                  </h2>
                  <ShareIconMenuButton
                    shareUrl={`/subastas/${remate.id}?lote=${encodeURIComponent(active.id)}`}
                    title={active.titulo ?? "Lote en remate"}
                    text={`Mira este lote en VEDISA Remates: ${active.titulo ?? "Lote"}`}
                    buttonLabel="Compartir lote"
                    menuAlign="right"
                  />
                </div>
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

                <aside className="flex min-w-0 flex-col gap-4 md:sticky md:top-20 md:self-start">
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
                            onClick={() => void placeMinimumBid()}
                            disabled={!canBidNow || busy}
                            className="mt-2 rounded-md border border-rose-300 bg-white px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {busy ? "Enviando..." : "Usar sugerencia"}
                          </button>
                        </>
                      ) : (
                        <p className="mt-1 text-sm text-neutral-600">Aún no tiene ofertas en este lote.</p>
                      )}
                    </div>
                  ) : null}

                  <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm ring-1 ring-neutral-100/80">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">Precios del lote</p>
                    <p className="mt-2 text-2xl font-black tabular-nums text-neutral-900">{formatClp(lotPriceDisplay)}</p>
                    <p className="mt-1 text-xs text-neutral-600">{lotPriceLabel}</p>
                    <div className="mt-4 border-t border-neutral-100 pt-4 space-y-3">
                      <button
                        type="button"
                        onClick={() => void placeMinimumBid()}
                        disabled={!canBidNow || busy}
                        className="w-full rounded-lg border border-[#0b3352] bg-[#0f3d5c] px-3 py-2.5 text-sm font-extrabold text-white shadow-md shadow-[#0f3d5c]/25 transition hover:-translate-y-[1px] hover:bg-[#0b3352] focus:outline-none focus:ring-2 focus:ring-[#33C7E3]/60 focus:ring-offset-1"
                      >
                        {busy ? "Enviando..." : `Oferta minima (${formatClp(minNext)})`}
                      </button>
                      <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3">
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
                            disabled={busyProxy || !canBidNow}
                            onClick={() => void setProxyBid()}
                            className="rounded-lg border border-neutral-300 px-3 py-2 text-xs font-bold text-neutral-700 hover:bg-neutral-100 disabled:opacity-50"
                          >
                            {busyProxy ? "Guardando…" : "Activar"}
                          </button>
                        </div>
                      </div>
                      <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3">
                        <p className="text-xs font-semibold text-neutral-700">Tu oferta personalizada</p>
                        <div className="mt-2 flex gap-2">
                          <input
                            value={customBidAmount}
                            onChange={(e) => setCustomBidAmount(formatCurrencyInput(e.target.value))}
                            inputMode="numeric"
                            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-neutral-900"
                            placeholder={formatCurrencyInput(String(Math.ceil(minNext))) || "$0"}
                          />
                          <button
                            type="button"
                            disabled={!canBidNow || busy}
                            onClick={() => void placeCustomBid()}
                            className="rounded-lg border border-[#0b3352] bg-[#0f3d5c] px-3 py-2 text-xs font-bold text-white hover:bg-[#0b3352] disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {busy ? "Enviando..." : "Enviar"}
                          </button>
                        </div>
                        <p className="mt-1 text-[11px] text-neutral-500">
                          Al escribir tu oferta se actualiza en tiempo real la simulación de costos.
                        </p>
                      </div>
                      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
                        <table className="w-full table-fixed text-xs">
                          <colgroup>
                            <col className="w-[56%]" />
                            <col className="w-[44%]" />
                          </colgroup>
                          <tbody>
                            <tr className="border-b border-neutral-100">
                              <td className="px-3 py-2 align-top font-semibold text-neutral-600">Valor ofertado</td>
                              <td className="px-2 py-2 text-right align-top font-bold tabular-nums text-neutral-900 whitespace-nowrap">
                                {formatClp(ofertaReferencia)}
                              </td>
                            </tr>
                            <tr className="border-b border-neutral-100">
                              <td className="px-3 py-2 align-top text-neutral-600">Comisión (12%)</td>
                              <td className="px-2 py-2 text-right align-top font-semibold tabular-nums text-neutral-900 whitespace-nowrap">
                                {formatClp(detalleComision)}
                              </td>
                            </tr>
                            <tr className="border-b border-neutral-100">
                              <td className="px-3 py-2 align-top text-neutral-600">IVA comisión (19%)</td>
                              <td className="px-2 py-2 text-right align-top font-semibold tabular-nums text-neutral-900 whitespace-nowrap">
                                {formatClp(detalleIvaComision)}
                              </td>
                            </tr>
                            <tr className="border-b border-neutral-100">
                              <td className="px-3 py-2 align-top text-neutral-600">Gastos operacionales (IVA incl.)</td>
                              <td className="px-2 py-2 text-right align-top font-semibold tabular-nums text-neutral-900 whitespace-nowrap">
                                {formatClp(GASTOS_OPERACIONALES_CLP)}
                              </td>
                            </tr>
                            <tr className="border-b border-neutral-100">
                              <td className="px-3 py-2 align-top text-neutral-600">Avalúo fiscal</td>
                              <td className="px-2 py-2 text-right align-top font-semibold tabular-nums text-neutral-900 whitespace-nowrap">
                                {detalleAvaluoFiscal != null ? formatClp(detalleAvaluoFiscal) : "Pendiente"}
                              </td>
                            </tr>
                            <tr className="border-b border-neutral-100">
                              <td className="px-3 py-2 align-top text-neutral-600">Impuesto transferencia (1,5%)</td>
                              <td className="px-2 py-2 text-right align-top font-semibold tabular-nums text-neutral-900 whitespace-nowrap">
                                {detalleImpuestoTransferencia != null ? formatClp(detalleImpuestoTransferencia) : "Pendiente"}
                              </td>
                            </tr>
                            <tr className="border-t-2 border-[#33C7E3]/40 bg-[#eaf7ff]">
                              <td className="px-3 py-2.5 align-top text-sm font-black text-[#0f3d5c]">Total estimado</td>
                              <td className="px-2 py-2.5 text-right align-top text-sm font-black tabular-nums text-[#0f3d5c] whitespace-nowrap">
                                {detalleTotalPagar != null ? formatClp(detalleTotalPagar) : "Pendiente"}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                      {!canBidNow ? (
                        <p className="text-xs font-semibold text-amber-700">
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
                      ) : null}
                    </div>
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

                  {viewerOffersOnlyMode ? (
                    <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
                      <h3 className="text-lg font-bold text-neutral-900">Ofertas recibidas ({listForActive.length})</h3>
                      {listForActive.length > 0 ? (
                        <div className="mt-3 hidden grid-cols-[5.5rem_8.5rem_minmax(0,1fr)] items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-neutral-500 sm:grid">
                          <span>Hora</span>
                          <span>Monto</span>
                          <span>Usuario</span>
                        </div>
                      ) : null}
                      <ul className="mt-3 max-h-96 space-y-2 overflow-auto text-sm">
                        {listForActive.length === 0 ? (
                          <li className="text-neutral-500">Aún no hay ofertas en este lote.</li>
                        ) : (
                          listForActive.map((o) => (
                            <li
                              key={o.id}
                              className="rounded-xl border border-neutral-200 bg-white px-3 py-2"
                            >
                              <div className="grid grid-cols-[5.2rem_minmax(0,1fr)] items-center gap-x-2 gap-y-1 sm:grid-cols-[5.5rem_8.5rem_minmax(0,1fr)]">
                                <span className="text-[11px] font-medium tabular-nums text-neutral-500">{formatClTime(o.created_at)}</span>
                                <span className="text-sm font-extrabold tabular-nums text-neutral-900">{formatClp(o.monto)}</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const targetId = String(o.user_id ?? "").trim();
                                    if (!targetId) return;
                                    setOfferUserCardError(null);
                                    setOpenOfferUserId((curr) => (curr === targetId ? null : targetId));
                                    void loadOfferUserCard(targetId);
                                  }}
                                  className="min-w-0 truncate text-left text-[11px] font-semibold text-[#0f3d5c] underline decoration-dotted underline-offset-2 hover:text-[#009ade] sm:text-xs"
                                  title="Ver datos del cliente"
                                >
                                  {formatOfferUserName(o, offerUserNamesById)}
                                </button>
                              </div>
                              {openOfferUserId === String(o.user_id ?? "").trim() ? (
                                <div className="mt-2 rounded-lg border border-sky-100 bg-sky-50/60 px-3 py-2 text-xs text-neutral-700">
                                  {loadingOfferUserId === String(o.user_id ?? "").trim() ? (
                                    <p className="text-neutral-500">Cargando datos del cliente…</p>
                                  ) : offerUserCardError ? (
                                    <p className="text-rose-700">{offerUserCardError}</p>
                                  ) : (
                                    (() => {
                                      const userId = String(o.user_id ?? "").trim();
                                      const card = offerUserCardsById[userId];
                                      const displayName =
                                        [String(card?.nombre ?? "").trim(), String(card?.apellido ?? "").trim()]
                                          .filter(Boolean)
                                          .join(" ")
                                          .trim() || null;
                                      const fields = [
                                        { label: "Nombre de usuario", value: String(card?.username ?? "").trim() || null },
                                        { label: "Nombre y apellido", value: displayName },
                                        { label: "RUT", value: String(card?.rut ?? "").trim() || null },
                                        { label: "Mail", value: String(card?.email ?? "").trim() || null },
                                        { label: "Teléfono", value: String(card?.telefono ?? "").trim() || null },
                                        { label: "Empresa", value: String(card?.empresa ?? "").trim() || null },
                                      ].filter((entry) => Boolean(entry.value));
                                      if (!fields.length) {
                                        return <p className="text-neutral-500">No hay datos adicionales para este usuario.</p>;
                                      }
                                      return (
                                        <div className="grid gap-1">
                                          {fields.map((entry) => (
                                            <p key={entry.label}>
                                              <span className="font-semibold text-neutral-900">{entry.label}:</span>{" "}
                                              <span>{entry.value}</span>
                                            </p>
                                          ))}
                                        </div>
                                      );
                                    })()
                                  )}
                                </div>
                              ) : null}
                            </li>
                          ))
                        )}
                      </ul>
                    </div>
                  ) : null}

                  {showPublicOfferSummary ? (
                    <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
                      <h3 className="text-lg font-bold text-neutral-900">Resumen de ofertas</h3>
                      <div className="mt-3 space-y-2 text-sm">
                        <p className="flex items-center justify-between gap-2 rounded-lg border border-neutral-100 px-3 py-2">
                          <span className="text-neutral-600">Cantidad de ofertas</span>
                          <span className="font-bold text-neutral-900 tabular-nums">{listForActive.length}</span>
                        </p>
                        {!showOnlyOffersCount ? (
                          <>
                            <p className="flex items-center justify-between gap-2 rounded-lg border border-neutral-100 px-3 py-2">
                              <span className="text-neutral-600">
                                {viewerIsClienteRemate ? "Oferta ganadora actual" : "Oferta líder actual"}
                              </span>
                              <span className="font-bold text-neutral-900 tabular-nums">
                                {topForActive ? formatClp(topForActive.monto) : "Sin ofertas"}
                              </span>
                            </p>
                            <p className="flex items-center justify-between gap-2 rounded-lg border border-neutral-100 px-3 py-2">
                              <span className="text-neutral-600">Usuario oferta</span>
                              <span className="max-w-[58%] truncate text-right font-bold text-neutral-900">
                                {topForActive ? topBidderUsername : "Sin ofertas"}
                              </span>
                            </p>
                          </>
                        ) : null}
                        <p
                          className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 ${
                            countdownLive !== null && countdownLive <= 0
                              ? "border-rose-200 bg-rose-50"
                              : isLastTenMinutes
                                ? "border-rose-200 bg-rose-50"
                                : "border-sky-200 bg-sky-50"
                          }`}
                        >
                          <span
                            className={
                              countdownLive !== null && countdownLive <= 0
                                ? "font-semibold text-rose-700"
                                : isLastTenMinutes
                                  ? "font-semibold text-rose-700"
                                  : "font-semibold text-sky-700"
                            }
                          >
                            Cuenta regresiva
                          </span>
                          <span
                            className={`font-mono text-base font-black tabular-nums ${
                              countdownLive !== null && countdownLive <= 0
                                ? "text-rose-800"
                                : isLastTenMinutes
                                  ? "text-rose-800"
                                  : "text-sky-800"
                            }`}
                          >
                            {countdownText}
                          </span>
                        </p>
                      </div>
                      {!viewerId ? (
                        <p className="mt-3 text-xs text-neutral-500">
                          Inicia sesión para ver más información y participar en el remate.
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  {roomView === "detallada" && viewerOffersOnlyMode ? (
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
                      const currentMax = getLeadingOffer(offersByLote[id] ?? [])?.monto ?? null;
                      const nextMin = currentMax == null ? Number(row.precio_base) : currentMax + incrementoPorLote(row);
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
