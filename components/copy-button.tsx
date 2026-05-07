"use client";

import { useState } from "react";

export function CopyButton({ text, label = "Copiar" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      setTimeout(() => setDone(false), 2000);
    } catch {
      /* noop */
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="rounded-md bg-[#009ade] px-3 py-1.5 text-xs font-bold text-white shadow hover:brightness-105"
    >
      {done ? "Copiado" : label}
    </button>
  );
}
