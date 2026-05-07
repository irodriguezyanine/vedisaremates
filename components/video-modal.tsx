"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

import { heroVideoId } from "@/lib/site-config";

const BTN_CLASS =
  "flex flex-1 items-center justify-center gap-2 rounded-lg border border-neutral-200 bg-[#f4f6f8] px-3 py-3 text-center text-[13px] font-semibold text-[#2c3e50] shadow-sm transition hover:bg-white hover:shadow-md md:text-sm min-h-[48px] cursor-pointer";

export function VideoModal() {
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

  return (
    <>
      <button type="button" className={BTN_CLASS} onClick={() => setOpen(true)} aria-haspopup="dialog">
        <span aria-hidden>▶</span>
        <strong>¿Cómo participar?</strong>
        <span className="hidden sm:inline">Ver video</span>
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[300] flex items-start justify-center bg-black/60 p-4 pt-[8vh] backdrop-blur-[2px]"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={id}
            className="relative w-full max-w-5xl overflow-hidden rounded-xl bg-white shadow-2xl"
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
