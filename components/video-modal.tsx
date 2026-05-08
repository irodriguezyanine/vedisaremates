"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

import { heroVideoId } from "@/lib/site-config";

const DEFAULT_TRIGGER =
  "flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border border-neutral-200 bg-[#f4f6f8] px-3 py-3 text-center text-[13px] font-semibold text-[#2c3e50] shadow-sm transition hover:bg-white hover:shadow-md md:text-sm min-h-[48px]";

type Props = {
  /** Reemplaza el estilo del botón (p. ej. celda del grid a ancho completo). */
  triggerClassName?: string;
};

export function VideoModal({ triggerClassName }: Props) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const vid = heroVideoId();

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [close, open]);

  const triggerClass = triggerClassName ?? DEFAULT_TRIGGER;

  return (
    <>
      <button type="button" className={triggerClass} onClick={() => setOpen(true)} aria-haspopup="dialog">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#009ade]/10 text-[#009ade] ring-1 ring-[#009ade]/20">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M8 5v14l11-7L8 5z" />
          </svg>
        </span>
        <span className="max-w-[200px] text-left sm:max-w-none">
          <span className="block text-[15px] font-bold text-[#0f2938]">¿Cómo participar?</span>
          <span className="mt-0.5 block text-[13px] font-medium text-neutral-600">Ver video</span>
        </span>
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[300] flex items-center justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-[2px]"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={id}
            className="relative my-4 w-full max-w-5xl shrink-0 overflow-hidden rounded-xl bg-white shadow-2xl"
          >
            <h2 id={id} className="sr-only">
              Video: cómo participar
            </h2>
            <button
              ref={closeRef}
              type="button"
              className="absolute right-2 top-2 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-2xl text-white hover:bg-black/70"
              aria-label="Cerrar video"
              onClick={close}
            >
              ×
            </button>
            <div className="aspect-video w-full bg-black">
              <iframe
                title="YouTube — cómo participar en VEDISA Remates"
                className="h-full w-full border-0"
                src={`https://www.youtube-nocookie.com/embed/${vid}?autoplay=1&rel=0`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
