"use client";

import { useEffect, useState, type ReactNode } from "react";

export function ScrollHeader({ children }: { children: ReactNode }) {
  const [raised, setRaised] = useState(false);

  useEffect(() => {
    const onScroll = () => setRaised(window.scrollY > 8);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-50 border-b border-white/10 bg-[#1a2332] text-white transition-shadow duration-200 ${
        raised ? "shadow-[0_8px_30px_rgba(0,0,0,0.35)] backdrop-blur-sm" : ""
      }`}
    >
      {children}
    </header>
  );
}
