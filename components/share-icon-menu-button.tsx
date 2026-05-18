"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Props = {
  shareUrl?: string;
  title?: string;
  text?: string;
  className?: string;
  menuAlign?: "left" | "right";
  buttonLabel?: string;
};

function toAbsoluteUrl(input?: string): string {
  if (typeof window === "undefined") return String(input ?? "");
  if (!input) return window.location.href;
  if (/^https?:\/\//i.test(input)) return input;
  try {
    return new URL(input, window.location.origin).toString();
  } catch {
    return window.location.href;
  }
}

export function ShareIconMenuButton({
  shareUrl,
  title = "VEDISA Remates",
  text = "Te comparto este enlace",
  className,
  menuAlign = "right",
  buttonLabel = "Compartir",
}: Props) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const absoluteUrl = useMemo(() => toAbsoluteUrl(shareUrl), [shareUrl]);

  useEffect(() => {
    if (!open) return;
    function onDocClick(event: MouseEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    function onEsc(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(absoluteUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // no-op
    }
  }, [absoluteUrl]);

  const openWhatsapp = useCallback(() => {
    const message = `${text} ${absoluteUrl}`.trim();
    const href = `https://api.whatsapp.com/send/?text=${encodeURIComponent(message)}&type=custom_url&app_absent=0`;
    window.open(href, "_blank", "noopener,noreferrer");
    setOpen(false);
  }, [text, absoluteUrl]);

  const openInstagramDirect = useCallback(async () => {
    const shareData = { title, text, url: absoluteUrl };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
        setOpen(false);
        return;
      } catch {
        // usuario cancelo o no soporta, cae al fallback
      }
    }
    await copyLink();
    window.open("https://www.instagram.com/direct/inbox/", "_blank", "noopener,noreferrer");
    setOpen(false);
  }, [title, text, absoluteUrl, copyLink]);

  const openMessenger = useCallback(async () => {
    await copyLink();
    window.open("https://www.messenger.com/", "_blank", "noopener,noreferrer");
    setOpen(false);
  }, [copyLink]);

  const copyAndClose = useCallback(async () => {
    await copyLink();
    setOpen(false);
  }, [copyLink]);

  const menuPosClass = menuAlign === "left" ? "left-0" : "right-0";

  return (
    <div ref={rootRef} className={`relative inline-flex ${className ?? ""}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded-md border border-[#23354f] bg-[#1a2332] px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#252f3f] hover:border-[#2d415f]"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={buttonLabel}
        title={buttonLabel}
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M16 8a3 3 0 1 0-2.83-4H13a3 3 0 0 0 .17 1L8.91 7.13a3 3 0 1 0 0 3.74l4.26 2.12A3 3 0 1 0 14 11a3 3 0 0 0-.83.12L8.91 9a3 3 0 0 0 0-2.02l4.26-2.13A3 3 0 0 0 16 8Z" />
        </svg>
        <span className="leading-none">Compartir</span>
      </button>
      {open ? (
        <div
          role="menu"
          className={`absolute ${menuPosClass} top-11 z-50 min-w-[220px] rounded-xl border border-neutral-200 bg-white p-1.5 shadow-xl`}
        >
          <button
            type="button"
            onClick={openWhatsapp}
            className="block w-full rounded-lg px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-50"
            role="menuitem"
          >
            Compartir en WhatsApp
          </button>
          <button
            type="button"
            onClick={() => void openInstagramDirect()}
            className="block w-full rounded-lg px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-50"
            role="menuitem"
          >
            Compartir por Instagram (Direct)
          </button>
          <button
            type="button"
            onClick={() => void openMessenger()}
            className="block w-full rounded-lg px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-50"
            role="menuitem"
          >
            Compartir por Messenger
          </button>
          <button
            type="button"
            onClick={() => void copyAndClose()}
            className="block w-full rounded-lg px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-50"
            role="menuitem"
          >
            {copied ? "Enlace copiado" : "Copiar enlace"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
