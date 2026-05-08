"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import type { PortalMisOfertaRow } from "@/lib/portal-types";
import { formatClp } from "@/lib/format-clp";
import { formatRoleLabel } from "@/lib/role-labels";
import { createClient } from "@/lib/supabase/client";

const REMATE_ESTADO: Record<string, string> = {
  borrador: "Borrador",
  publicado: "Publicado",
  en_curso: "En curso",
  cerrado: "Cerrado",
};

function formatRemateEstado(s: string) {
  return REMATE_ESTADO[s] ?? s.replace(/_/g, " ");
}

type Props = {
  email: string;
  initialNombre: string | null;
  initialRol: string | null;
};

export function MiCuentaDashboard({ email, initialNombre, initialRol }: Props) {
  const [nombre, setNombre] = useState(initialNombre ?? "");
  const [savingNombre, setSavingNombre] = useState(false);
  const [nombreMsg, setNombreMsg] = useState<string | null>(null);
  const [ofertas, setOfertas] = useState<PortalMisOfertaRow[] | null>(null);
  const [ofertasErr, setOfertasErr] = useState<string | null>(null);

  const isClienteRemate = (initialRol ?? "").toLowerCase() === "cliente_remate";

  const cargarOfertas = useCallback(async () => {
    setOfertasErr(null);
    const sb = createClient();
    if (!sb) {
      setOfertasErr("Servicio temporalmente no disponible.");
      return;
    }
    const { data, error } = await sb.rpc("portal_listar_mis_ofertas");
    if (error) {
      setOfertas([]);
      setOfertasErr(
        "Las ofertas aparecerán en esta lista después de una actualización del sistema por parte del equipo Vedisa.",
      );
      return;
    }
    setOfertas(((data ?? []) as PortalMisOfertaRow[]) || []);
    setOfertasErr(null);
  }, []);

  useEffect(() => {
    void cargarOfertas();
  }, [cargarOfertas]);

  async function guardarNombre(ev: React.FormEvent) {
    ev.preventDefault();
    setSavingNombre(true);
    setNombreMsg(null);
    const sb = createClient();
    if (!sb) {
      setNombreMsg("Servicio temporalmente no disponible.");
      setSavingNombre(false);
      return;
    }
    const { data, error } = await sb.rpc("portal_update_mi_nombre", { p_nombre: nombre.trim() });
    const res = data as { ok?: boolean; error?: string } | null;
    if (error || res?.ok === false) {
      setNombreMsg("No pudimos guardar tus datos por ahora. Contactá soporte Vedisa.");
      setSavingNombre(false);
      return;
    }
    setNombreMsg("Datos guardados.");
    setSavingNombre(false);
  }

  return (
    <div className="min-h-[60vh] bg-gradient-to-b from-[#f0f9fc] via-white to-white">
      <div className="mx-auto max-w-5xl px-4 py-10 sm:py-14">
        <Link href="/" className="text-sm font-semibold text-[#009ade] hover:underline">
          ← Inicio
        </Link>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_minmax(0,360px)]">
          <section
            className={`relative overflow-hidden rounded-3xl border p-8 shadow-sm ${
              isClienteRemate
                ? "border-[#33C7E3]/35 bg-gradient-to-br from-[#1a2c4e] via-[#1e3a52] to-[#0f1f2c] text-white"
                : "border-neutral-200 bg-white text-neutral-900"
            }`}
          >
            {isClienteRemate ? (
              <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-[#33C7E3]/20 blur-3xl" aria-hidden />
            ) : null}
            <div className="relative">
              <p className={`text-xs font-bold uppercase tracking-[0.2em] ${isClienteRemate ? "text-[#33C7E3]" : "text-[#009ade]"}`}>
                Tu espacio
              </p>
              <h1 className={`mt-2 text-3xl font-black ${isClienteRemate ? "text-white" : "text-neutral-900"}`}>
                {isClienteRemate ? "Cliente remate" : "Mi cuenta"}
              </h1>
              <p className={`mt-3 max-w-xl text-sm leading-relaxed ${isClienteRemate ? "text-white/80" : "text-neutral-600"}`}>
                {isClienteRemate
                  ? "Gestioná tu perfil público y seguí todas las ofertas que hagas en la sala en línea."
                  : "Actualizá tu nombre visible y revisá tu actividad en los remates."}
              </p>
              <div className="mt-6 flex flex-wrap gap-3 text-sm">
                <span className={`rounded-xl px-3 py-1.5 font-semibold ${isClienteRemate ? "bg-white/10 text-white" : "bg-neutral-100 text-neutral-800"}`}>
                  {email}
                </span>
                <span className={`rounded-xl px-3 py-1.5 ${isClienteRemate ? "bg-[#FFC600]/20 text-[#FFC600]" : "bg-[#e8f4fc] text-[#1a2c4e]"}`}>
                  {formatRoleLabel(initialRol)}
                </span>
              </div>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/subastas"
                  className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-[#33C7E3] to-[#2ab0c9] px-5 py-3 text-sm font-bold text-[#0f1f2c] shadow-md hover:brightness-105"
                >
                  Ir a sala de remates
                </Link>
                {(initialRol ?? "").toLowerCase() === "admin" ? (
                  <Link
                    href="/admin"
                    className={`inline-flex items-center justify-center rounded-xl border px-5 py-3 text-sm font-bold ${
                      isClienteRemate ? "border-white/30 text-white hover:bg-white/10" : "border-neutral-300 text-neutral-900 hover:bg-neutral-50"
                    }`}
                  >
                    Panel administración
                  </Link>
                ) : null}
              </div>
            </div>
          </section>

          <aside className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold text-neutral-900">Perfil público</h2>
            <p className="mt-1 text-sm text-neutral-600">Este nombre pueden verlo los operadores cuando revisan las ofertas.</p>
            <form onSubmit={(e) => void guardarNombre(e)} className="mt-5 space-y-4">
              <label className="block text-sm font-medium text-neutral-800">
                Nombre o razón visible
                <input
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-neutral-900 shadow-sm focus:border-[#33C7E3] focus:outline-none focus:ring-2 focus:ring-[#33C7E3]/25"
                  placeholder="Ej. Ignacio Rodríguez"
                />
              </label>
              <button
                type="submit"
                disabled={savingNombre}
                className="w-full rounded-xl bg-[#1a2c4e] py-3 text-sm font-bold text-white transition hover:bg-[#243a62] disabled:opacity-60"
              >
                {savingNombre ? "Guardando…" : "Guardar cambios"}
              </button>
              {nombreMsg ? <p className="text-sm text-emerald-700">{nombreMsg}</p> : null}
            </form>
          </aside>
        </div>

        <section className="mt-10 rounded-3xl border border-neutral-200 bg-white shadow-sm">
          <div className="border-b border-neutral-100 px-6 py-5 sm:px-8">
            <h2 className="text-xl font-bold text-neutral-900">Ofertas realizadas</h2>
            <p className="mt-1 text-sm text-neutral-600">
              Historial ordenado desde la última vez que apostaste por un lote. Podés entrar de nuevo al remate desde la tabla.
            </p>
          </div>
          {ofertasErr ? <p className="px-6 py-8 text-center text-sm text-amber-800 sm:px-8">{ofertasErr}</p> : null}
          {!ofertasErr && ofertas && ofertas.length === 0 ? (
            <div className="px-6 py-16 text-center sm:px-8">
              <p className="text-neutral-700">Todavía no registramos ofertas con esta cuenta.</p>
              <Link href="/subastas" className="mt-4 inline-block font-bold text-[#009ade] hover:underline">
                Explorar remates disponibles →
              </Link>
            </div>
          ) : null}
          {ofertas && ofertas.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-[720px] w-full border-collapse text-left text-sm">
                <thead className="bg-neutral-50 text-xs font-bold uppercase tracking-wider text-neutral-500">
                  <tr>
                    <th className="px-6 py-3 sm:px-8">Fecha</th>
                    <th className="px-4 py-3">Remate</th>
                    <th className="px-4 py-3">Lote</th>
                    <th className="px-4 py-3">Estado</th>
                    <th className="px-4 py-3 text-right">Monto</th>
                    <th className="px-6 py-3 sm:px-8" />
                  </tr>
                </thead>
                <tbody>
                  {ofertas.map((o) => (
                    <tr key={o.oferta_id} className="border-t border-neutral-100 text-neutral-800">
                      <td className="whitespace-nowrap px-6 py-4 text-neutral-600 sm:px-8">
                        {new Date(o.created_at).toLocaleString("es-CL")}
                      </td>
                      <td className="max-w-[200px] px-4 py-4 font-medium">{o.remate_titulo}</td>
                      <td className="max-w-[180px] px-4 py-4 text-neutral-600">{o.lote_titulo}</td>
                      <td className="px-4 py-4">
                        <span className="rounded-full bg-[#eef6ff] px-2.5 py-1 text-xs font-semibold text-[#1a2c4e]">
                          {formatRemateEstado(o.remate_estado)}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-right font-bold tabular-nums text-neutral-900">{formatClp(o.monto)}</td>
                      <td className="px-6 py-4 sm:px-8">
                        <Link href={`/subastas/${o.remate_id}`} className="text-xs font-bold text-[#009ade] hover:underline">
                          Ver sala →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
