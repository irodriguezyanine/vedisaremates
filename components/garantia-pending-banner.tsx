"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Props = {
  userId: string | null;
  show: boolean;
};

export function GarantiaPendingBanner({ userId, show }: Props) {
  const [dismissed, setDismissed] = useState(false);
  const storageKey = userId ? `garantia-banner-dismissed:${userId}` : null;

  useEffect(() => {
    if (!show || !storageKey) {
      setDismissed(false);
      return;
    }
    try {
      setDismissed(localStorage.getItem(storageKey) === "1");
    } catch {
      setDismissed(false);
    }
  }, [show, storageKey]);

  if (!show || dismissed) return null;

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
        <button
          type="button"
          onClick={() => {
            if (storageKey) {
              try {
                localStorage.setItem(storageKey, "1");
              } catch {
                // no-op
              }
            }
            setDismissed(true);
          }}
          aria-label="Cerrar aviso de garantía"
          className="shrink-0 rounded-md border border-amber-300 p-1.5 text-amber-900 hover:bg-amber-100"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </section>
  );
}
