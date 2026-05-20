"use client";

import { useEffect, useMemo, useState } from "react";

import { VehicleSpecGrid } from "@/components/vehicle-spec-grid";
import { extraerCamposAutoredInventario, leerValorEsperadoInventario } from "@/lib/autored/extract-inventario";
import { fetchPrecioPublicacionAutored } from "@/lib/autored/fetch-precio-publicacion.client";
import { formatClp, formatThousandsEsClInteger } from "@/lib/format-clp";
import type { LotePortalContext, RematePortalContext } from "@/lib/inventario-ficha";
import type { InventarioRow } from "@/lib/portal-types";
import { getVehicleSpecs, vehicleSummaryTitle } from "@/lib/vehicle-spec-summary";

type PrecioFuente = "inventario" | "autored";

function PrecioReferencialPublicacionCard({
  inventario,
}: {
  inventario: InventarioRow & Record<string, unknown>;
}) {
  const campos = useMemo(() => extraerCamposAutoredInventario(inventario), [inventario]);
  const valorEsperadoInventario = useMemo(() => leerValorEsperadoInventario(inventario), [inventario]);
  const lookupKey = `${valorEsperadoInventario ?? ""}|${campos.patente}|${campos.version ?? ""}|${campos.kilometrajeNum ?? ""}`;

  const [estado, setEstado] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [precio, setPrecio] = useState<number | null>(null);
  const [fuente, setFuente] = useState<PrecioFuente | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (valorEsperadoInventario != null && valorEsperadoInventario > 0) {
      setPrecio(valorEsperadoInventario);
      setFuente("inventario");
      setEstado("ok");
      setErrorMsg(null);
      return;
    }

    if (campos.patente.length < 5) {
      setEstado("error");
      setPrecio(null);
      setFuente(null);
      setErrorMsg("Sin patente válida ni precio referencial en inventario");
      return;
    }

    let cancelled = false;
    setEstado("loading");
    setErrorMsg(null);
    setFuente(null);

    void fetchPrecioPublicacionAutored({
      patente: campos.patente,
      version: campos.version,
      kilometraje: campos.kilometraje,
    }).then((res) => {
      if (cancelled) return;
      if (res.ok && res.precio_publicacion != null) {
        setPrecio(res.precio_publicacion);
        setFuente("autored");
        setEstado("ok");
        setErrorMsg(null);
      } else {
        setPrecio(null);
        setFuente(null);
        setEstado("error");
        setErrorMsg(res.error ?? "Precio de publicación no disponible");
      }
    });

    return () => {
      cancelled = true;
    };
  }, [lookupKey, valorEsperadoInventario, campos.patente, campos.version, campos.kilometraje]);

  const consultaDetalle = [
    campos.patente || null,
    campos.version ? `versión ${campos.version}` : null,
    campos.kilometrajeNum != null ? `${formatThousandsEsClInteger(campos.kilometrajeNum)} km` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const descripcionFuente =
    fuente === "inventario"
      ? "Mismo valor que «Precio aproximado referencial Vedisa» del inventario Tasaciones (valor_esperado)."
      : fuente === "autored"
        ? `Consulta Autored (plan B) según patente${campos.version ? ", versión" : ""}${campos.kilometrajeNum != null ? " y kilometraje" : ""} del vehículo.`
        : "Referencia de publicación del vehículo.";

  return (
    <div className="rounded-2xl border border-[#009ade]/25 bg-gradient-to-br from-[#f0fafd] via-white to-white p-5 shadow-sm ring-1 ring-[#009ade]/10">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#009ade]/10 text-[#009ade]">
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" aria-hidden>
            <path d="M6 8h12M6 12h8M6 16h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <rect x="4" y="4" width="16" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-wider text-[#009ade]">Precio referencial de publicación</p>
          <p className="mt-1 text-2xl font-black tracking-tight text-neutral-900 sm:text-[1.65rem]">
            {estado === "loading" ? (
              <span className="text-lg font-semibold text-neutral-500">Consultando referencia…</span>
            ) : estado === "ok" && precio != null ? (
              formatClp(precio)
            ) : (
              <span className="text-lg font-semibold text-neutral-500">No disponible</span>
            )}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-neutral-500">
            {descripcionFuente}
            {consultaDetalle ? (
              <>
                {" "}
                <span className="font-medium text-neutral-600">{consultaDetalle}</span>
              </>
            ) : null}
          </p>
          {estado === "error" && errorMsg ? (
            <p className="mt-2 text-xs text-amber-800/90">{errorMsg}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function LoteVehicleSummary({
  inventario,
  lotePortal,
  rematePortal,
}: {
  inventario: InventarioRow;
  lotePortal: LotePortalContext;
  rematePortal: RematePortalContext;
}) {
  const specs = useMemo(() => getVehicleSpecs(inventario), [inventario]);
  const title = useMemo(() => vehicleSummaryTitle(inventario), [inventario]);
  const invRecord = inventario as InventarioRow & Record<string, unknown>;

  const loteSubtitle = [
    lotePortal.orden != null ? `Lote ${lotePortal.orden}` : null,
    lotePortal.titulo?.trim() || null,
    rematePortal.titulo?.trim() || null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <section className="space-y-5" aria-label="Resumen del vehículo">
      <header className="space-y-1">
        <h3 className="text-xl font-black tracking-tight text-neutral-900 sm:text-2xl">{title}</h3>
        {loteSubtitle ? <p className="text-sm text-neutral-500">{loteSubtitle}</p> : null}
      </header>

      {specs.length > 0 ? <VehicleSpecGrid specs={specs} size="md" /> : null}

      <PrecioReferencialPublicacionCard inventario={invRecord} />
    </section>
  );
}
