"use client";

import type { ReactNode, SVGProps } from "react";
import Link from "next/link";
import { useMemo } from "react";

import { formatClp } from "@/lib/format-clp";
import type { InventarioFichaSection } from "@/lib/inventario-ficha";
import {
  buildInventarioFichaSections,
  buildLotePortalRows,
  type LotePortalContext,
  type RematePortalContext,
} from "@/lib/inventario-ficha";
import type { InventarioRow } from "@/lib/portal-types";

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

function IconCar(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.45" strokeLinejoin="round" aria-hidden {...props}>
      <path d="M6 16h12M5 12h14l-1-3H6l-1 3Z" />
      <circle cx="7.5" cy="16" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="16.5" cy="16" r="1.5" fill="currentColor" stroke="none" />
      <path d="M8 9V7h8v2" strokeLinecap="round" />
    </svg>
  );
}

function IconEngine(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden {...props}>
      <path
        d="M8 14h-.5A1.5 1.5 0 0 1 6 12.5V10h4V8l2 2v2h6v2l-2 .5v2m-8-10V6"
        stroke="currentColor"
        strokeWidth="1.4"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconShield(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden {...props}>
      <path d="M12 3 5 6v7c0 5 7 10 7 10s7-5 7-10V6l-7-3Z" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinejoin="round" />
    </svg>
  );
}

function IconDocs(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden {...props}>
      <path d="M8 8h8M8 12h8M8 16h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" fill="none" />
      <rect x="5" y="3" width="14" height="18" rx="2" stroke="currentColor" strokeWidth="1.4" fill="none" />
    </svg>
  );
}

function IconPin(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden {...props}>
      <path
        d="M12 11a2 2 0 1 0-.001-4.001A2 2 0 0 0 12 11Zm0 11c-5-5-7-9-7-13a7 7 0 1 1 14 0c0 4-2 8-7 13Z"
        stroke="currentColor"
        strokeWidth="1.3"
        fill="none"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconGauge(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden {...props}>
      <circle cx="12" cy="15" r="8" stroke="currentColor" strokeWidth="1.4" fill="none" />
      <path d="M12 15 16 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function IconCash(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden {...props}>
      <rect x="3" y="6" width="18" height="12" rx="2" stroke="currentColor" strokeWidth="1.4" fill="none" />
      <path d="M12 8v8M15 12h-6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function IconGrid(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden {...props}>
      <circle cx="8" cy="8" r="2.5" fill="currentColor" />
      <circle cx="16" cy="8" r="2.5" fill="currentColor" />
      <circle cx="8" cy="16" r="2.5" fill="currentColor" />
      <circle cx="16" cy="16" r="2.5" fill="currentColor" />
    </svg>
  );
}

function sectionGlyph(title: string): ReactNode {
  const t = title.toLowerCase();
  const cls = "h-6 w-6 shrink-0 text-[#009ade]";
  if (t.includes("vedisa") || t.includes("este lote")) return <IconDocs className={cls} />;
  if (t.includes("portal") || t.includes("identificaci")) return <IconCar className={cls} />;
  if (t.includes("aspecto")) return <IconGauge className={cls} />;
  if (t.includes("estado")) return <IconShield className={cls} />;
  if (t.includes("propiedad") || t.includes("ubicaci")) return <IconPin className={cls} />;
  if (t.includes("permiso") || t.includes("documentaci")) return <IconDocs className={cls} />;
  if (t.includes("chasis") || t.includes("motor")) return <IconEngine className={cls} />;
  if (t.includes("valoraci") || t.includes("empresa")) return <IconCash className={cls} />;
  if (t.includes("descripción") || t.includes("extendida")) return <IconDocs className={cls} />;
  if (t.includes("otros")) return <IconGrid className={cls} />;
  return <IconCar className={cls} />;
}

function SpecCard({ row }: { row: InventarioFichaSection["rows"][number] }) {
  const wrap = /\n|.{140,}/.test(row.value);
  return (
    <div className="flex gap-3 rounded-xl border border-neutral-200/95 bg-white p-4 shadow-[0_1px_0_rgba(15,23,42,0.04)] ring-1 ring-neutral-100/70 transition hover:border-[#009ade]/30 hover:shadow-sm">
      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#e8f4fc] text-[#0f5f87] shadow-inner ring-1 ring-[#009ade]/15">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="m9 5 7 7-7 7" />
        </svg>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-neutral-400">{row.label}</p>
        <p className={`mt-1 font-semibold leading-snug text-neutral-900 ${wrap ? "whitespace-pre-wrap text-[15px] font-medium" : "text-[15px]"}`}>
          {row.value}
        </p>
      </div>
    </div>
  );
}

export type InventarioFichaTecnicaProps = {
  inventario: InventarioRow & Record<string, unknown>;
  /** Metadatos del lote/remate público (tipo detalle Rainworks). */
  lotePortal?: LotePortalContext | null;
  rematePortal?: RematePortalContext | null;
  /** Tarjeta con recordatorio sobre transferencia administrativa (enlaza a términos). */
  transferenciaDisclaimer?: boolean;
};

export function InventarioFichaTecnica({
  inventario,
  lotePortal,
  rematePortal,
  transferenciaDisclaimer = true,
}: InventarioFichaTecnicaProps) {
  const sections = useMemo(() => buildInventarioFichaSections(inventario), [inventario]);

  const portalRows = useMemo(() => {
    if (!lotePortal || !rematePortal) return [];
    return buildLotePortalRows(lotePortal, rematePortal, {
      fechaLarga: fechaLargaCl,
      clp: (n) => (n != null ? formatClp(n) : null),
    });
  }, [lotePortal, rematePortal]);

  return (
    <div className="space-y-10">
      {portalRows.length ? (
        <section className="space-y-3" aria-labelledby="ficha-lote-portal">
          <div className="flex items-center gap-3">
            {sectionGlyph("Este lote")}
            <h3 id="ficha-lote-portal" className="text-lg font-black tracking-tight text-neutral-900">
              Este lote en Vedisa Remates
            </h3>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {portalRows.map((row) => (
              <SpecCard key={`${row.label}-${row.value}`} row={{ ...row, sourceKey: undefined }} />
            ))}
          </div>
        </section>
      ) : null}

      {transferenciaDisclaimer ? (
        <aside className="rounded-2xl border border-[#009ade]/20 bg-gradient-to-br from-[#f0fafd] via-white to-white p-5 shadow-sm ring-1 ring-[#009ade]/10">
          <div className="flex flex-wrap items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#009ade]/10 text-[#009ade]">
              <IconDocs className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1 space-y-1 text-sm text-neutral-700">
              <p className="font-bold text-neutral-900">Comisión, gastos administrativos y transferencia</p>
              <p className="leading-relaxed">
                Además del monto adjudicado aplican cargos vigentes informados en nuestros{" "}
                <Link href="/terminos" className="font-semibold text-[#009ade] underline-offset-4 hover:underline">
                  términos y condiciones
                </Link>{" "}
                (ej. comisión comprador <strong className="text-neutral-900">12% + IVA</strong>, más gastos y
                impuesto correspondiente sobre transferencia, según el caso).
              </p>
            </div>
          </div>
        </aside>
      ) : null}

      {sections.map((sec) => (
        <section key={sec.title} className="space-y-4" aria-labelledby={`sec-${normalizeId(sec.title)}`}>
          <div className="flex flex-wrap items-center gap-3 border-b border-neutral-100 pb-3">
            {sectionGlyph(sec.title)}
            <div className="min-w-0">
              <h3 id={`sec-${normalizeId(sec.title)}`} className="text-lg font-black tracking-tight text-neutral-900">
                {sec.title}
              </h3>
              {sec.description ? <p className="mt-1 text-sm text-neutral-500">{sec.description}</p> : null}
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {sec.rows.map((row) => (
              <SpecCard key={`${sec.title}-${row.label}-${row.value.slice(0, 42)}`} row={row} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function normalizeId(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .slice(0, 64);
}
