"use client";

import { useMemo } from "react";

import { VehicleSpecGrid } from "@/components/vehicle-spec-grid";
import { formatClp } from "@/lib/format-clp";
import type { LotePortalContext, RematePortalContext } from "@/lib/inventario-ficha";
import type { InventarioRow } from "@/lib/portal-types";
import { getVehicleSpecs, vehicleSummaryTitle } from "@/lib/vehicle-spec-summary";

const TZ = { timeZone: "America/Santiago" } satisfies Intl.DateTimeFormatOptions;

function fechaLargaCl(iso?: string | null): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString("es-CL", {
      ...TZ,
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return null;
  }
}

function MetaRow({
  icon,
  label,
  value,
}: {
  icon: "calendar" | "clock" | "price" | "step";
  label: string;
  value: string | null;
}) {
  if (!value) return null;
  const iconClass = "h-5 w-5 shrink-0 text-[#009ade]";
  const glyph =
    icon === "calendar" ? (
      <svg viewBox="0 0 24 24" className={iconClass} fill="none" aria-hidden>
        <rect x="4" y="5" width="16" height="15" rx="2" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8 3v4M16 3v4M4 10h16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ) : icon === "clock" ? (
      <svg viewBox="0 0 24 24" className={iconClass} fill="none" aria-hidden>
        <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.5" />
        <path d="M12 8v4l3 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ) : icon === "price" ? (
      <svg viewBox="0 0 24 24" className={iconClass} fill="none" aria-hidden>
        <path d="M6 8h12M6 12h8M6 16h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <rect x="4" y="4" width="16" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ) : (
      <svg viewBox="0 0 24 24" className={iconClass} fill="none" aria-hidden>
        <path d="M6 16l4-8 4 8M8 12h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );

  return (
    <div className="flex items-start gap-3 rounded-xl border border-neutral-200/90 bg-white px-4 py-3 shadow-sm">
      {glyph}
      <div className="min-w-0 flex-1">
        <p className="text-[0.65rem] font-bold uppercase tracking-wider text-neutral-500">{label}</p>
        <p className="mt-0.5 text-sm font-bold text-neutral-900">{value}</p>
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

  const inicio = fechaLargaCl(rematePortal.starts_at);
  const cierre = fechaLargaCl(rematePortal.ends_at);
  const precioBase = lotePortal.precio_base != null ? formatClp(lotePortal.precio_base) : null;
  const incremento = lotePortal.incremento_minimo != null ? formatClp(lotePortal.incremento_minimo) : null;

  const loteSubtitle = [
    lotePortal.orden != null ? `Lote ${lotePortal.orden}` : null,
    lotePortal.titulo?.trim() || null,
    rematePortal.titulo?.trim() || null,
  ]
    .filter(Boolean)
    .join(" · ");

  const hasRemateMeta = Boolean(inicio || cierre || precioBase || incremento);

  return (
    <section className="space-y-5" aria-label="Resumen del vehículo y del lote">
      <header className="space-y-1">
        <h3 className="text-xl font-black tracking-tight text-neutral-900 sm:text-2xl">{title}</h3>
        {loteSubtitle ? <p className="text-sm text-neutral-500">{loteSubtitle}</p> : null}
      </header>

      {specs.length > 0 ? <VehicleSpecGrid specs={specs} size="md" /> : null}

      {hasRemateMeta ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <MetaRow icon="calendar" label="Inicio del remate" value={inicio} />
          <MetaRow icon="clock" label="Cierre programado" value={cierre} />
          <MetaRow icon="price" label="Precio base publicado" value={precioBase} />
          <MetaRow icon="step" label="Incremento mínimo de oferta" value={incremento} />
        </div>
      ) : null}
    </section>
  );
}
