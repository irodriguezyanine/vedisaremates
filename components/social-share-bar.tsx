"use client";

import { useCallback, useState } from "react";

export function SocialShareBar() {
  const [copied, setCopied] = useState(false);

  const share = useCallback(async () => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    try {
      if (navigator.share) {
        await navigator.share({ title: "VEDISA Remates", url });
        return;
      }
    } catch {
      /* cancelado o no soportado */
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* noop */
    }
  }, []);

  return (
    <div
      className="border-y border-neutral-200/80 bg-gradient-to-r from-neutral-50 via-white to-neutral-50 py-2 text-center"
      role="region"
      aria-label="Compartir"
    >
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-3 px-4 text-sm text-neutral-600">
        <span className="font-semibold text-neutral-500">Compartir:</span>
        <button
          type="button"
          onClick={share}
          className="rounded-full border border-neutral-200 bg-white px-4 py-1.5 font-medium text-[#1a2c4e] shadow-sm hover:border-[#33C7E3] hover:text-[#009ade]"
        >
          {copied ? "¡Enlace copiado!" : "Copiar enlace / nativo"}
        </button>
      </div>
    </div>
  );
}
