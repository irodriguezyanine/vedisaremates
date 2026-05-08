"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { SITE } from "@/lib/site-config";

const links = [
  { href: "/admin", label: "Resumen" },
  { href: "/admin/usuarios", label: "Usuarios" },
  { href: "/admin/inventario", label: "Inventario Tasaciones" },
  { href: "/admin/remates", label: "Remates y lotes" },
];

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex w-full flex-col gap-6 border-r border-white/10 bg-[#141c28] p-6 lg:w-60 lg:shrink-0">
      <div className="border-b border-white/10 pb-6">
        <Link
          href="/"
          className="block rounded-xl p-2 -m-2 outline-none ring-offset-[#141c28] transition hover:bg-white/[0.06] focus-visible:ring-2 focus-visible:ring-[#33C7E3]"
          aria-label={`${SITE.name} — Ir al inicio público (mantener sesión iniciada)`}
          title="Ir al inicio del sitio público"
        >
          <Image
            src="/vedisa-logo-navbar.png"
            alt={`${SITE.name}`}
            width={480}
            height={96}
            className="mx-auto h-auto w-full max-h-11 max-w-[220px] object-contain object-left"
            sizes="220px"
            priority
          />
        </Link>
        <p className="mt-3 text-center text-[11px] font-medium uppercase tracking-wide text-neutral-500">Administración</p>
      </div>
      <p className="text-center text-[11px] leading-snug text-neutral-500">
        No cierra sesión: seguís logueado como admin.
      </p>
      <nav className="flex flex-col gap-1">
        {links.map(({ href, label }) => {
          const active = pathname === href || (href !== "/admin" && pathname.startsWith(`${href}/`));
          const isRoot = href === "/admin";
          const rootActive = isRoot ? pathname === "/admin" : false;
          const vis = isRoot ? rootActive : active;
          return (
            <Link
              key={href}
              href={href}
              className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                vis ? "bg-[#33C7E3]/15 text-[#33C7E3]" : "text-neutral-300 hover:bg-white/5 hover:text-white"
              }`}
            >
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto pt-8 text-xs text-neutral-500">Panel restringido a personal autorizado.</div>
    </aside>
  );
}
