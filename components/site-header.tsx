"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { catalogoHref, SITE } from "@/lib/site-config";

import { HeaderAuth } from "@/components/header-auth";
import { NavVerMenuContent } from "@/components/nav-ver-menu-content";
import { ScrollHeader } from "./scroll-header";

const navClasses = (active: boolean) =>
  `inline-flex whitespace-nowrap rounded-md px-2.5 py-2 text-sm font-medium transition-colors ${
    active ? "bg-white/10 text-[#FFC600]" : "text-white/85 hover:bg-white/10 hover:text-[#33C7E3]"
  }`;

const remataTuAutoNavClasses =
  "inline-flex shrink-0 whitespace-nowrap rounded-md px-2.5 py-2 text-sm font-bold text-[#FFC600] transition-colors hover:bg-white/10 hover:text-white";

export function SiteHeader() {
  const pathname = usePathname();
  const cat = catalogoHref();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [catOpen, setCatOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const catRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);

  const isActive = useCallback((p: string) => pathname === p, [pathname]);

  const closeMobile = useCallback(() => setMobileOpen(false), []);

  useEffect(() => {
    queueMicrotask(() => {
      setCatOpen(false);
      setMoreOpen(false);
      setMobileOpen(false);
    });
  }, [pathname]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (catRef.current && !catRef.current.contains(t)) setCatOpen(false);
      if (moreRef.current && !moreRef.current.contains(t)) setMoreOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setCatOpen(false);
        setMoreOpen(false);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <ScrollHeader>
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 overflow-visible px-4 py-2 sm:px-6 lg:px-8">
        <div className="flex min-w-0 flex-1 items-center gap-3 overflow-visible lg:gap-4">
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
              className="h-9 w-auto max-w-[min(52vw,220px)] sm:h-10 sm:max-w-[260px]"
              sizes="(max-width: 640px) 52vw, 260px"
              priority
            />
          </Link>

          <nav
            className="hidden min-w-0 flex-1 items-center justify-start gap-0.5 overflow-visible lg:flex xl:justify-center"
            aria-label="Principal"
          >
            <Link href="/" className={navClasses(isActive("/"))}>
              Inicio
            </Link>

            <div className="relative z-[60] shrink-0" ref={catRef}>
              <button
                type="button"
                className={navClasses(false)}
                aria-expanded={catOpen}
                aria-haspopup="menu"
                id="nav-ver-trigger"
                onClick={() => {
                  setMoreOpen(false);
                  setCatOpen((o) => !o);
                }}
              >
                Ver
              </button>
              {catOpen ? (
                <div
                  role="menu"
                  aria-labelledby="nav-ver-trigger"
                  className="absolute left-0 top-full z-[70] mt-1.5 min-w-[280px] max-h-[min(70vh,520px)] overflow-y-auto rounded-lg border border-black/10 bg-white py-0 text-neutral-800 shadow-xl"
                >
                  <NavVerMenuContent
                    variant="dropdown"
                    onNavigate={() => {
                      setCatOpen(false);
                      setMobileOpen(false);
                    }}
                  />
                </div>
              ) : null}
            </div>

            <Link
              href={cat}
              target="_blank"
              rel="noopener noreferrer"
              className={`${navClasses(false)} shrink-0`}
            >
              Catálogo
            </Link>
            <Link
              href="/subastas"
              className={`${navClasses(isActive("/subastas") || Boolean(pathname?.startsWith("/subastas/")))} shrink-0`}
            >
              Subastas
            </Link>
            <a
              href={SITE.remataTuAutoHref}
              target="_blank"
              rel="noopener noreferrer"
              className={remataTuAutoNavClasses}
            >
              ¡Remata tu auto acá!
            </a>

            <div className="relative z-[60] shrink-0" ref={moreRef}>
              <button
                type="button"
                className={navClasses(false)}
                aria-expanded={moreOpen}
                aria-haspopup="menu"
                id="nav-mas-trigger"
                onClick={() => {
                  setCatOpen(false);
                  setMoreOpen((o) => !o);
                }}
              >
                Más
              </button>
              {moreOpen ? (
                <div
                  role="menu"
                  aria-labelledby="nav-mas-trigger"
                  className="absolute right-0 top-full z-[70] mt-1.5 min-w-[220px] rounded-lg border border-black/10 bg-white py-2 text-neutral-800 shadow-xl"
                >
                  <Link
                    href="/como-participar"
                    role="menuitem"
                    className="block px-4 py-2 text-sm hover:bg-neutral-50"
                  >
                    Cómo participar
                  </Link>
                  <Link href="/faq" role="menuitem" className="block px-4 py-2 text-sm hover:bg-neutral-50">
                    Ayuda / FAQ
                  </Link>
                  <Link href="/contacto" role="menuitem" className="block px-4 py-2 text-sm hover:bg-neutral-50">
                    Contacto
                  </Link>
                  <Link href="/acerca" role="menuitem" className="block px-4 py-2 text-sm hover:bg-neutral-50">
                    Acerca de
                  </Link>
                  <Link href="/buscar" role="menuitem" className="block px-4 py-2 text-sm hover:bg-neutral-50">
                    Búsqueda
                  </Link>
                </div>
              ) : null}
            </div>
          </nav>
        </div>

        <div className="hidden shrink-0 lg:flex">
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
          <div className="mx-auto flex max-h-[calc(100dvh-64px)] max-w-7xl flex-col gap-1 overflow-y-auto px-3 py-2.5">
            <div className="mb-1 rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
              <HeaderAuth onNavigate={closeMobile} />
            </div>

            <Link href="/" className="rounded-md px-3 py-2.5 text-white/90 hover:bg-white/5" onClick={closeMobile}>
              Inicio
            </Link>
            <Link
              href={cat}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md px-3 py-2.5 hover:bg-white/5"
              onClick={closeMobile}
            >
              Catálogo
            </Link>
            <Link href="/subastas" className="rounded-md px-3 py-2.5 hover:bg-white/5" onClick={closeMobile}>
              Subastas en vivo
            </Link>
            <a
              href={SITE.remataTuAutoHref}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md px-3 py-2.5 font-bold text-[#FFC600] hover:bg-white/5"
              onClick={closeMobile}
            >
              ¡Remata tu auto acá!
            </a>
            <Link href="/como-participar" className="rounded-md px-3 py-2.5 hover:bg-white/5" onClick={closeMobile}>
              Cómo participar
            </Link>
            <Link href="/faq" className="rounded-md px-3 py-2.5 hover:bg-white/5" onClick={closeMobile}>
              Ayuda / FAQ
            </Link>
            <Link href="/contacto" className="rounded-md px-3 py-2.5 hover:bg-white/5" onClick={closeMobile}>
              Contacto
            </Link>
            <Link href="/acerca" className="rounded-md px-3 py-2.5 hover:bg-white/5" onClick={closeMobile}>
              Acerca de
            </Link>
            <Link href="/terminos" className="rounded-md px-3 py-2.5 hover:bg-white/5" onClick={closeMobile}>
              Términos
            </Link>
            <Link href="/buscar" className="rounded-md px-3 py-2.5 hover:bg-white/5" onClick={closeMobile}>
              Búsqueda avanzada
            </Link>
          </div>
        </div>
      ) : null}
    </ScrollHeader>
  );
}
