import Link from "next/link";

import { ShareIconMenuButton } from "@/components/share-icon-menu-button";
import {
  classifyRemateForSala,
  countdownLabelFromEndsAt,
  formatRemateScheduleCompact,
  groupRematesBySalaSection,
  REMATE_SALA_SECTIONS,
  rematePublicStatusBadgeClass,
  rematePublicStatusLabel,
} from "@/lib/portal-remate-feed";
import type { PortalRemateRecomendadoRow, PortalRemateRow } from "@/lib/portal-types";

function RemateSalaCard({
  remate,
  thumb,
}: {
  remate: PortalRemateRow;
  thumb: string | null | undefined;
}) {
  const section = classifyRemateForSala(remate);
  const statusLabel = rematePublicStatusLabel(section);
  const countdown = section !== "cerrados" ? countdownLabelFromEndsAt(remate.ends_at) : null;

  return (
    <li className="relative">
      <Link
        href={`/subastas/${remate.id}`}
        className="group flex flex-col overflow-hidden rounded-2xl border border-neutral-200/90 bg-white shadow-[0_10px_28px_rgba(15,23,42,0.06)] ring-1 ring-[#dbe8f5] transition hover:-translate-y-0.5 hover:border-[#33C7E3]/50 hover:shadow-[0_18px_40px_rgba(0,154,222,0.12)] sm:flex-row sm:items-stretch"
      >
        <div className="relative aspect-[16/10] w-full shrink-0 bg-gradient-to-br from-neutral-100 via-neutral-200 to-sky-50 sm:aspect-auto sm:w-[188px] lg:w-[220px]">
          {thumb ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={thumb}
              alt=""
              className="absolute inset-0 h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
              loading="lazy"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
              Sin miniatura
            </div>
          )}
        </div>
        <div className="flex min-h-0 flex-1 flex-col justify-between gap-3 p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-2 pr-10">
            <div className="min-w-0 flex-1">
              <h3 className="line-clamp-2 text-lg font-black tracking-tight text-neutral-900 group-hover:text-[#009ade] sm:text-xl">
                {remate.titulo}
              </h3>
              {remate.descripcion ? (
                <p className="mt-1.5 line-clamp-2 text-sm text-neutral-600">{remate.descripcion}</p>
              ) : null}
            </div>
            <span
              className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide ${rematePublicStatusBadgeClass(section)}`}
            >
              {statusLabel}
            </span>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-neutral-100 pt-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <span
                className="inline-flex items-center rounded-md border border-sky-200/80 bg-sky-50 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-sky-800"
                title="Inicio del remate"
              >
                {formatRemateScheduleCompact(remate.starts_at)}
              </span>
              <span className="text-[10px] font-bold text-neutral-300" aria-hidden>
                →
              </span>
              <span
                className="inline-flex items-center rounded-md border border-emerald-200/80 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-emerald-800"
                title="Cierre del remate"
              >
                {formatRemateScheduleCompact(remate.ends_at)}
              </span>
              {countdown ? (
                <span className="inline-flex items-center rounded-md border border-rose-200/80 bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-700">
                  <span className="mr-1">Cierra</span>
                  <span className="tabular-nums font-extrabold">{countdown}</span>
                </span>
              ) : null}
            </div>
            <span className="text-xs font-bold text-[#009ade] group-hover:underline">Entrar →</span>
          </div>
        </div>
      </Link>
      <div className="absolute right-3 top-3 z-10 sm:right-4 sm:top-4">
        <ShareIconMenuButton
          shareUrl={`/subastas/${remate.id}`}
          title={remate.titulo}
          text={`Revisa este remate en VEDISA Remates: ${remate.titulo}`}
          buttonLabel="Compartir remate"
        />
      </div>
    </li>
  );
}

export function RemateSalaList({
  rows,
  thumbMap,
  recomendado,
}: {
  rows: PortalRemateRow[];
  thumbMap: Record<string, string | null | undefined>;
  recomendado: PortalRemateRecomendadoRow | null;
}) {
  const grouped = groupRematesBySalaSection(rows);

  return (
    <div className="mt-10 space-y-12">
      {recomendado ? (
        <div className="rounded-2xl border border-sky-200/80 bg-gradient-to-br from-sky-50 to-white px-5 py-4 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-wider text-sky-700">Próximo remate recomendado</p>
          <p className="mt-1 text-base font-bold text-neutral-900">{recomendado.titulo}</p>
          <p className="mt-0.5 text-xs text-neutral-600">{recomendado.motivo}</p>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <span
              className="inline-flex items-center rounded-md border border-emerald-200/80 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-emerald-800"
              title="Cierre del remate"
            >
              {formatRemateScheduleCompact(recomendado.ends_at)}
            </span>
            <Link href={`/subastas/${recomendado.remate_id}`} className="text-xs font-bold text-[#009ade] hover:underline">
              Ver recomendado →
            </Link>
          </div>
        </div>
      ) : null}

      {REMATE_SALA_SECTIONS.map(({ key, title }) => {
        const sectionRows = grouped[key];
        if (!sectionRows.length) return null;

        return (
          <section key={key} aria-labelledby={`sala-section-${key}`}>
            <div className="mb-4 flex flex-wrap items-end justify-between gap-2 border-b border-neutral-200/80 pb-3">
              <div>
                <h2 id={`sala-section-${key}`} className="text-xl font-black tracking-tight text-neutral-900 sm:text-2xl">
                  {title}
                </h2>
                <p className="mt-0.5 text-sm text-neutral-500">
                  {sectionRows.length} {sectionRows.length === 1 ? "remate" : "remates"}
                </p>
              </div>
            </div>
            <ul className="space-y-4">
              {sectionRows.map((r) => (
                <RemateSalaCard key={r.id} remate={r} thumb={thumbMap[r.id]} />
              ))}
            </ul>
          </section>
        );
      })}

      {!rows.length ? (
        <p className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-8 text-center text-neutral-600">
          Todavía no hay remates publicados. Cuando los administradores creen eventos y los marquen como publicados,
          aparecerán aquí automáticamente.
        </p>
      ) : null}
    </div>
  );
}
