"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { Session } from "@supabase/supabase-js";

import { formatClp } from "@/lib/format-clp";
import type { InventarioRow, PortalOfertaRow, PortalRemateLoteRow, PortalRemateRow } from "@/lib/portal-types";
import { createClient } from "@/lib/supabase/client";

type Lote = PortalRemateLoteRow & { inventario: InventarioRow | null };

type Props = {
  initialRemate: PortalRemateRow;
  initialLotes: Lote[];
  viewerId?: string | null;
};

export function AuctionLiveRoom({ initialRemate, initialLotes, viewerId }: Props) {
  const [remate, setRemate] = useState(initialRemate);
  const [lotes, setLotes] = useState<Lote[]>(initialLotes);
  const [activeId, setActiveId] = useState<string | null>(initialLotes[0]?.id ?? null);
  const [offersByLote, setOffersByLote] = useState<Record<string, PortalOfertaRow[]>>({});
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);

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
    void loadOffers(lotes.map((l) => l.id));
  }, [lotes, loadOffers]);

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

  const topOffer = (loteId: string) => {
    const list = offersByLote[loteId] ?? [];
    return list.length ? list[0]!.monto : null;
  };

  const minNext = useMemo(() => {
    if (!active) return 0;
    const max = topOffer(active.id);
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
  const countdown = remate.ends_at ? new Date(remate.ends_at).getTime() - Date.now() : 0;

  const canBid =
    viewerId &&
    remate.estado === "en_curso" &&
    countdown > 0 &&
    (!remate.starts_at || new Date(remate.starts_at).getTime() <= Date.now());

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/subastas" className="text-sm font-semibold text-[#009ade] hover:underline">
            ← Sala de remates
          </Link>
          <h1 className="mt-2 text-3xl font-black text-neutral-900">{remate.titulo}</h1>
          <p className="mt-2 max-w-xl text-neutral-600">{remate.descripcion ?? " "} </p>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm shadow-sm">
          <p className="text-xs uppercase text-neutral-500">Estado dinámico</p>
          <p className="mt-1 font-bold text-neutral-900">{remate.estado.replaceAll("_", " ")}</p>
          <p className={`mt-1 text-xs ${countdown <= 0 ? "text-red-600" : "text-emerald-700"}`}>
            {countdown <= 0
              ? "Cierre procesado por horario UTC del servidor."
              : `Cierra ${new Date(remate.ends_at).toLocaleString("es-CL")}`}
          </p>
          {viewerId ? (
            <p className="mt-3 text-[11px] text-neutral-500">Conectado como {sessionEmail}</p>
          ) : (
            <Link href={`/ingreso?redirect=/subastas/${remate.id}`} className="mt-2 inline-block font-semibold text-[#009ade]">
              Iniciá sesión para ofertar
            </Link>
          )}
        </div>
      </div>

      {lotes.length === 0 ? (
        <p className="text-neutral-600">Este remate aún no tiene lotes publicados.</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_minmax(0,320px)]">
          <div className="space-y-4">
            <p className="text-sm font-semibold text-neutral-700">Seleccioná un lote</p>
            <div className="flex flex-wrap gap-2">
              {lotes.map((l, i) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => setActiveId(l.id)}
                  className={`rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
                    l.id === activeId
                      ? "border-transparent bg-[#1a2c4e] text-white"
                      : "border-neutral-300 bg-white text-neutral-700 hover:border-[#33C7E3]"
                  }`}
                >
                  {i + 1}. {(l.inventario?.patente ?? l.titulo ?? "Lote").slice(0, 28)}
                </button>
              ))}
            </div>

            {active ? (
              <article className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
                <h2 className="text-xl font-bold text-neutral-900">{active.titulo ?? "Lote"}</h2>
                {active.inventario ? (
                  <div className="mt-3 grid gap-2 text-sm text-neutral-600 sm:grid-cols-2">
                    <p>
                      <span className="font-semibold text-neutral-800">Patente:</span> {active.inventario.patente ?? "—"}
                    </p>
                    <p>
                      <span className="font-semibold text-neutral-800">Marca / modelo:</span>{" "}
                      {[active.inventario.marca, active.inventario.modelo].filter(Boolean).join(" ") || "—"}
                    </p>
                    {active.inventario.descripcion ? (
                      <p className="sm:col-span-2">{String(active.inventario.descripcion).slice(0, 400)}</p>
                    ) : null}
                  </div>
                ) : null}
                <div className="mt-4 flex flex-wrap gap-4 text-sm">
                  <span className="rounded-lg bg-[#e8f4fc] px-3 py-1 font-semibold text-[#1a2c4e]">
                    Precio base {formatClp(active.precio_base)}
                  </span>
                  <span className="rounded-lg bg-neutral-100 px-3 py-1 font-semibold text-neutral-800">
                    Puja mínima siguiente {formatClp(minNext)}
                  </span>
                </div>
              </article>
            ) : null}
          </div>

          <aside className="space-y-4">
            <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
              <h3 className="text-lg font-bold text-neutral-900">Tu oferta</h3>
              {!canBid ? (
                <p className="mt-2 text-sm text-neutral-600">
                  {remate.estado !== "en_curso"
                    ? "Cuando el remate esté en curso podrás ofertar."
                    : countdown <= 0
                      ? "El remate ya cerró según la fecha de fin."
                      : "Esperando la hora de inicio."}
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
                      <span className="text-neutral-500">{new Date(o.created_at).toLocaleTimeString("es-CL")}</span>
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
      )}
    </div>
  );
}
