"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { catalogoHref, SITE } from "@/lib/site-config";

import { HeaderAuth } from "@/components/header-auth";
import { ScrollHeader } from "./scroll-header";

const navClasses = (active: boolean) =>
  `rounded-md px-3 py-2 text-sm font-medium transition-colors ${
    active ? "bg-white/10 text-[#FFC600]" : "text-white/85 hover:bg-white/10 hover:text-[#33C7E3]"
  }`;

export function SiteHeader() {
  const pathname = usePathname();
  const cat = catalogoHref();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [catOpen, setCatOpen] = useState(false);
  const catRef = useRef<HTMLDivElement>(null);

  const isActive = useCallback((p: string) => pathname === p, [pathname]);

  const closeMobile = useCallback(() => setMobileOpen(false), []);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (catRef.current && !catRef.current.contains(e.target as Node)) setCatOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <ScrollHeader>
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="flex shrink-0 items-center hover:opacity-90"
          aria-label={`${SITE.name} — inicio`}
        >
          <Image
            src="/vedisa-logo-navbar.png"
            alt={`${SITE.name} — ${SITE.tagline}`}
            width={480}
            height={96}
            className="h-9 w-auto max-w-[min(58vw,260px)] sm:h-10 sm:max-w-[300px]"
            sizes="(max-width: 640px) 58vw, 300px"
            priority
          />
        </Link>

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Principal">
          <Link href="/" className={navClasses(isActive("/"))}>
            Inicio
          </Link>

          <div className="relative" ref={catRef}>
            <button
              type="button"
              className={navClasses(false)}
              aria-expanded={catOpen}
              aria-haspopup="true"
              onClick={() => setCatOpen((o) => !o)}
            >
              Ver <span aria-hidden className="ml-0.5 text-[10px]">▾</span>
            </button>
            {catOpen ? (
              <div
                role="menu"
                className="absolute left-0 top-full z-50 mt-1 min-w-[220px] rounded-lg border border-black/10 bg-white py-2 text-neutral-800 shadow-xl"
              >
                <Link href="/" role="menuitem" className="block px-4 py-2 text-sm hover:bg-neutral-50">
                  Todas las categorías
                </Link>
                <div className="border-t border-neutral-100 px-4 py-2 text-xs text-neutral-500">
                  DESARME <span className="text-neutral-400">0</span>
                </div>
                <div className="px-4 py-2 text-xs text-neutral-500">
                  LIVIANOS <span className="font-medium text-neutral-800">1</span>
                </div>
                <div className="px-4 py-2 text-xs text-neutral-500">
                  PESADOS <span className="text-neutral-400">0</span>
                </div>
                <div className="px-4 py-2 text-xs text-neutral-500">
                  VENTA DIRECTA <span className="font-medium text-neutral-800">17</span>
                </div>
              </div>
            ) : null}
          </div>

          <Link href={cat} target="_blank" rel="noopener noreferrer" className={navClasses(false)}>
            Catálogo
          </Link>
          <Link href="/subastas" className={navClasses(isActive("/subastas") || pathname?.startsWith("/subastas/"))}>
            Subastas
          </Link>
          <Link href="/como-participar" className={navClasses(isActive("/como-participar"))}>
            Cómo participar
          </Link>
          <Link href="/faq" className={navClasses(isActive("/faq"))}>
            Ayuda
          </Link>
          <Link href="/contacto" className={navClasses(isActive("/contacto"))}>
            Contacto
          </Link>
          <Link href="/acerca" className={navClasses(isActive("/acerca"))}>
            Acerca de
          </Link>
          <Link href="/buscar" className={navClasses(isActive("/buscar"))}>
            Búsqueda
          </Link>
        </nav>

        <div className="hidden items-center gap-2 lg:flex">
          <HeaderAuth />
        </div>

        <button
          type="button"
          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border border-white/20 lg:hidden"
          aria-expanded={mobileOpen}
          aria-controls="mobile-nav"
          onClick={() => setMobileOpen((v) => !v)}
        >
          <span className="sr-only">Menú</span>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
            {mobileOpen ? (
              <path strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      {mobileOpen ? (
        <div id="mobile-nav" className="border-t border-white/10 bg-[#141c28] lg:hidden">
          <div className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-4">
            <Link href="/" className="rounded-md px-3 py-3 text-white/90 hover:bg-white/5" onClick={closeMobile}>
              Inicio
            </Link>
            <Link
              href={cat}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md px-3 py-3 hover:bg-white/5"
              onClick={closeMobile}
            >
              Catálogo
            </Link>
            <Link href="/subastas" className="rounded-md px-3 py-3 hover:bg-white/5" onClick={closeMobile}>
              Subastas en vivo
            </Link>
            <Link href="/como-participar" className="rounded-md px-3 py-3 hover:bg-white/5" onClick={closeMobile}>
              Cómo participar
            </Link>
            <Link href="/faq" className="rounded-md px-3 py-3 hover:bg-white/5" onClick={closeMobile}>
              Ayuda / FAQ
            </Link>
            <Link href="/contacto" className="rounded-md px-3 py-3 hover:bg-white/5" onClick={closeMobile}>
              Contacto
            </Link>
            <Link href="/terminos" className="rounded-md px-3 py-3 hover:bg-white/5" onClick={closeMobile}>
              Términos
            </Link>
            <Link href="/buscar" className="rounded-md px-3 py-3 hover:bg-white/5" onClick={closeMobile}>
              Búsqueda avanzada
            </Link>
            <div className="mt-2 border-t border-white/10 pt-4">
              <HeaderAuth onNavigate={closeMobile} />
            </div>
          </div>
        </div>
      ) : null}
    </ScrollHeader>
  );
}
