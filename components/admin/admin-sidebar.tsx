"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/admin", label: "Resumen" },
  { href: "/admin/usuarios", label: "Usuarios (Supabase)" },
  { href: "/admin/inventario", label: "Inventario Tasaciones" },
  { href: "/admin/remates", label: "Remates y lotes" },
];

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex w-full flex-col gap-6 border-r border-white/10 bg-[#141c28] p-6 lg:w-60 lg:shrink-0">
      <div>
        <p className="text-xs uppercase tracking-wide text-neutral-500">VEDISA Remates</p>
        <p className="text-lg font-bold text-white">Administración</p>
      </div>
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
      <div className="mt-auto pt-8 text-xs text-neutral-500">
        Misma cuenta y Edge Functions que en{" "}
        <span className="text-neutral-400">Tasaciones Vedisa</span>.
      </div>
    </aside>
  );
}
