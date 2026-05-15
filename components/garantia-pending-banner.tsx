"use client";

import Link from "next/link";

type Props = {
  userId: string | null;
  show: boolean;
};

export function GarantiaPendingBanner({ userId, show }: Props) {
  if (!show) return null;

  return (
    <section className="border-b border-amber-200 bg-gradient-to-r from-amber-50 via-white to-amber-50">
      <div className="mx-auto flex max-w-7xl items-start justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-amber-900">Deposite su garantía para poder ofertar</p>
            <Link
              href="/garantia"
              className="inline-flex items-center rounded-full bg-[#009ade] px-3 py-1.5 text-xs font-bold text-white hover:brightness-105"
            >
              Ver medios de pago
            </Link>
          </div>
          <p className="mt-0.5 text-xs text-amber-800/90">
            Puede revisar el catálogo sin garantía, pero para ofertar necesita constituirla.
          </p>
        </div>
        <span className="shrink-0 rounded-md border border-amber-300 bg-amber-100/60 px-2 py-1 text-[11px] font-semibold text-amber-900">
          Importante
        </span>
      </div>
    </section>
  );
}
