"use client";

import type { ReactNode, SVGProps } from "react";
import Link from "next/link";
import { Fragment, useEffect, useMemo, useState } from "react";

import { formatClp } from "@/lib/format-clp";
import {
  normalizeDescripcionIntegrationText,
  sanitizeBasicDescripcionHtml,
  textoPareceHtmlDescripcion,
} from "@/lib/catalog-descripcion-html";
import type { InventarioFichaSection } from "@/lib/inventario-ficha";
import {
  applyFichaPublicConfig,
  buildInventarioFichaSections,
  buildLotePortalRows,
  normalizeMapKey,
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
  if (t.includes("precios referencia") || t.includes("valoraci") || t.includes("empresa")) return (
    <IconCash className={cls} />
  );
  if (t.includes("descripción") || t.includes("extendida")) return <IconDocs className={cls} />;
  if (t.includes("otros")) return <IconGrid className={cls} />;
  return <IconCar className={cls} />;
}

function isDescripcionTasacionesObservacionesRow(row: InventarioFichaSection["rows"][number]): boolean {
  const nk = normalizeMapKey(row.sourceKey ?? "");
  const sk = nk.replace(/^fields_/, "").replace(/^field_/, "").replace(/^fields_/, "");
  if (sk === "descripcion" || sk === "observaciones") return true;

  const L = row.label.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return L.includes("tasaciones") && (L.includes("descripcion") || L.includes("observaciones"));
}

function CatalogDescripcionRichText({ value }: { value: string }) {
  const normalized = useMemo(() => normalizeDescripcionIntegrationText(value), [value]);
  const renderAsHtml = useMemo(() => textoPareceHtmlDescripcion(normalized), [normalized]);
  const safeHtml = useMemo(() => sanitizeBasicDescripcionHtml(normalized), [normalized]);

  const richClasses =
    "max-w-none w-full text-[15px] sm:text-[16px] leading-relaxed text-neutral-800 [&_p]:mb-3 [&_p:last-child]:mb-0 [&_br]:leading-normal [&_strong]:font-bold [&_strong]:text-neutral-900 [&_b]:font-bold [&_em]:italic [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-1 [&_h2]:mt-6 [&_h2]:mb-2 [&_h2]:text-xl [&_h2]:font-black [&_h3]:mt-5 [&_h3]:mb-2 [&_h3]:text-lg [&_h3]:font-black [&_h4]:mt-4 [&_h4]:text-base [&_h4]:font-bold [&_blockquote]:border-l-[3px] [&_blockquote]:border-[#009ade]/35 [&_blockquote]:pl-4 [&_blockquote]:italic [&_a]:break-words [&_a]:font-semibold [&_a]:text-[#009ade] [&_a]:underline [&_a]:underline-offset-4";

  if (renderAsHtml && safeHtml.trim()) {
    return (
      <div
        className={`descripcion-catalogo-html ${richClasses}`}
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: safeHtml }}
      />
    );
  }

  const blocks = normalized.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);

  return (
    <div className={`descripcion-catalogo-plain ${richClasses}`}>
      {blocks.length === 0 ? (
        <p className="text-neutral-500">{normalized || "—"}</p>
      ) : (
        blocks.map((block, i) => (
          <p key={i} className="font-medium">
            {block.split("\n").map((line, j) => (
              <Fragment key={j}>
                {j > 0 ? <br /> : null}
                {line}
              </Fragment>
            ))}
          </p>
        ))
      )}
    </div>
  );
}

function CatalogSpecRow({ row }: { row: InventarioFichaSection["rows"][number] }) {
  if (isDescripcionTasacionesObservacionesRow(row)) {
    return (
      <div className="border-b border-neutral-100 py-5 sm:py-6 last:border-b-0">
        <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="mt-1 hidden h-2 w-2 shrink-0 rounded-full bg-[#009ade] sm:block" aria-hidden />
          <span className="text-[12px] font-bold uppercase tracking-[0.12em] text-neutral-500">{row.label}</span>
        </div>
        <div className="rounded-2xl border border-neutral-200/90 bg-gradient-to-br from-neutral-50/95 via-white to-[#f4fafc]/80 px-5 py-5 shadow-inner ring-1 ring-neutral-100 sm:px-8 sm:py-7">
          <CatalogDescripcionRichText value={row.value} />
        </div>
      </div>
    );
  }

  const wrap = /\n|.{140,}/.test(row.value);
  return (
    <div className="grid gap-1 py-3 sm:grid-cols-[minmax(0,min(36%,240px))_1fr] sm:gap-8 sm:items-baseline">
      <div className="flex items-start gap-2">
        <span className="mt-1.5 hidden h-1.5 w-1.5 shrink-0 rounded-full bg-[#009ade]/75 sm:block" aria-hidden />
        <span className="text-[12px] font-bold uppercase tracking-[0.1em] text-neutral-500">{row.label}</span>
      </div>
      <p
        className={`text-[15px] font-semibold leading-snug text-neutral-900 ${wrap ? "whitespace-pre-wrap font-medium leading-relaxed" : ""}`}
      >
        {row.value}
      </p>
    </div>
  );
}

function CatalogBlock({ rows }: { rows: InventarioFichaSection["rows"] }) {
  if (!rows.length) return null;
  return (
    <div className="overflow-hidden rounded-2xl border border-neutral-200/90 bg-white shadow-sm ring-1 ring-neutral-100/80">
      <div className="divide-y divide-neutral-100 px-4 sm:px-5">
        {rows.map((row) => (
          <CatalogSpecRow key={`${row.sourceKey ?? row.label}-${row.value.slice(0, 40)}`} row={row} />
        ))}
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
  /** JSON `portal_inventario_ficha_config` (v1) desde el servidor. */
  fichaDisplayConfig?: unknown | null;
};

export function InventarioFichaTecnica({
  inventario,
  lotePortal,
  rematePortal,
  transferenciaDisclaimer = true,
  fichaDisplayConfig = null,
}: InventarioFichaTecnicaProps) {
  const rawSections = useMemo(() => buildInventarioFichaSections(inventario), [inventario]);

  const rawPortalRows = useMemo(() => {
    if (!lotePortal || !rematePortal) return [];
    return buildLotePortalRows(lotePortal, rematePortal, {
      fechaLarga: fechaLargaCl,
      clp: (n) => (n != null ? formatClp(n) : null),
    });
  }, [lotePortal, rematePortal]);

  const { sections, portalRows } = useMemo(
    () => applyFichaPublicConfig(rawSections, rawPortalRows, fichaDisplayConfig),
    [rawSections, rawPortalRows, fichaDisplayConfig],
  );

  const tabbedSections = useMemo(() => sections.filter((sec) => isTabbedSectionTitle(sec.title)), [sections]);
  const regularSections = useMemo(() => sections.filter((sec) => !isTabbedSectionTitle(sec.title)), [sections]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  useEffect(() => {
    if (!tabbedSections.length) {
      setActiveTabId(null);
      return;
    }
    const currentIsValid = tabbedSections.some((sec) => normalizeId(sec.title) === activeTabId);
    if (!currentIsValid) setActiveTabId(normalizeId(tabbedSections[0].title));
  }, [tabbedSections, activeTabId]);

  const activeTabbedSection = useMemo(() => {
    if (!tabbedSections.length) return null;
    return tabbedSections.find((sec) => normalizeId(sec.title) === activeTabId) ?? tabbedSections[0];
  }, [tabbedSections, activeTabId]);

  return (
    <div className="space-y-10">
      {portalRows.length ? (
        <section className="space-y-4" aria-labelledby="ficha-lote-portal">
          <div className="flex items-center gap-3">
            {sectionGlyph("Este lote")}
            <div>
              <h3 id="ficha-lote-portal" className="text-lg font-black tracking-tight text-neutral-900">
                Este lote en Vedisa Remates
              </h3>
              <p className="mt-1 text-sm text-neutral-500">Datos públicos del lote y del calendario del remate.</p>
            </div>
          </div>
          <CatalogBlock rows={portalRows} />
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

      {tabbedSections.length ? (
        <section className="space-y-4" aria-labelledby="ficha-tabbed-sections">
          <div className="flex flex-wrap items-center gap-3">
            <h3 id="ficha-tabbed-sections" className="text-lg font-black tracking-tight text-neutral-900">
              Información del vehículo
            </h3>
          </div>
          <div className="flex flex-wrap gap-2 rounded-2xl border border-neutral-200/90 bg-neutral-50 p-2">
            {tabbedSections.map((sec) => {
              const tabId = normalizeId(sec.title);
              const active = tabId === normalizeId(activeTabbedSection?.title ?? "");
              return (
                <button
                  key={tabId}
                  type="button"
                  className={`rounded-xl px-3.5 py-2 text-sm font-bold transition ${
                    active ? "bg-white text-[#006ea1] shadow-sm ring-1 ring-[#009ade]/20" : "text-neutral-600 hover:bg-white/70 hover:text-neutral-900"
                  }`}
                  onClick={() => setActiveTabId(tabId)}
                  aria-pressed={active}
                >
                  {tabTitle(sec.title)}
                </button>
              );
            })}
          </div>

          {activeTabbedSection ? <SectionContent sec={activeTabbedSection} /> : null}
        </section>
      ) : null}

      {regularSections.map((sec) => (
        <SectionContent key={sec.title} sec={sec} />
      ))}
    </div>
  );
}

function SectionContent({ sec }: { sec: InventarioFichaSection }) {
  return (
    <section className="space-y-4" aria-labelledby={`sec-${normalizeId(sec.title)}`}>
      <div className="flex flex-wrap items-start gap-3 border-b border-neutral-100 pb-3">
        {sectionGlyph(sec.title)}
        <div className="min-w-0 flex-1">
          <h3 id={`sec-${normalizeId(sec.title)}`} className="text-lg font-black tracking-tight text-neutral-900">
            {sec.title}
          </h3>
          {sec.description ? <p className="mt-1 max-w-[65ch] text-sm text-neutral-500">{sec.description}</p> : null}
        </div>
      </div>
      <CatalogBlock rows={sec.rows} />
    </section>
  );
}

function normalizeId(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .slice(0, 64);
}

function isTabbedSectionTitle(title: string): boolean {
  const id = normalizeId(title).toLowerCase();
  return id.includes("identificacion_del_vehiculo") || id.includes("otros_datos_del_sistema") || id.includes("precios_referenciales");
}

function tabTitle(title: string): string {
  if (normalizeId(title).toLowerCase().includes("otros_datos_del_sistema")) return "Otros datos";
  return title;
}
