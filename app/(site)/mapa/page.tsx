import Link from "next/link";

import type { Metadata } from "next";

import { catalogoHref } from "@/lib/site-config";

export const metadata: Metadata = {
  title: "Mapa del sitio",
  description: "Índice de páginas del portal VEDISA Remates.",
};

const links = [
  { href: "/", label: "Inicio" },
  { href: "/como-participar", label: "Cómo participar" },
  { href: "/acerca", label: "Acerca de" },
  { href: "/faq", label: "Ayuda / FAQ" },
  { href: "/contacto", label: "Contacto" },
  { href: "/terminos", label: "Términos y condiciones" },
  { href: "/privacidad", label: "Política de privacidad" },
  { href: "/buscar", label: "Búsqueda avanzada" },
  { href: "/registro", label: "Registro" },
  { href: "/mi-cuenta", label: "Mi cuenta" },
  { href: catalogoHref(), label: "Catálogo público (externo)", external: true },
];

export default function MapaPage() {
  return (
    <div className="mx-auto max-w-xl px-4 py-12">
      <h1 className="text-2xl font-bold text-[#1a2c4e]">Mapa del sitio</h1>
      <ul className="mt-8 space-y-3 text-[#009ade]">
        {links.map((l) => (
          <li key={l.href}>
            <Link
              href={l.href}
              {...(l.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
              className="font-medium hover:underline"
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
