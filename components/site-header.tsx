import Link from "next/link";

const CATALOGO_HREF =
  process.env.NEXT_PUBLIC_CATALOGO_URL ?? "https://catalogo.vedisaremates.cl/";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-black/10 bg-[#252f3f] text-white shadow-sm">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2 text-lg font-bold tracking-wide">
          <span className="text-[#33C7E3]">VEDISA</span>
          <span className="font-semibold text-white/95">REMATES</span>
        </Link>

        <nav className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          <Link href="/" className="text-white/90 hover:text-[#FFC600]">
            Home
          </Link>

          <div className="group relative">
            <button
              type="button"
              className="inline-flex items-center gap-1 text-white/90 hover:text-[#FFC600]"
              aria-expanded={false}
            >
              Ver
              <span className="text-[10px] opacity-70" aria-hidden>
                ▼
              </span>
            </button>
            <div className="invisible absolute left-0 top-full z-50 mt-1 min-w-[200px] rounded border border-black/10 bg-white py-2 text-neutral-800 opacity-0 shadow-lg transition-opacity group-hover:visible group-hover:opacity-100">
              <Link href="/" className="block px-4 py-2 hover:bg-neutral-50">
                Todas las categorías
              </Link>
              <span className="block px-4 py-1 text-xs text-neutral-500">
                DESARME <span className="text-neutral-400">0</span>
              </span>
              <span className="block px-4 py-1 text-xs text-neutral-500">
                LIVIANOS <span className="font-medium text-neutral-700">1</span>
              </span>
              <span className="block px-4 py-1 text-xs text-neutral-500">
                PESADOS <span className="text-neutral-400">0</span>
              </span>
              <span className="block px-4 py-1 text-xs text-neutral-500">
                VENTA DIRECTA <span className="font-medium text-neutral-700">17</span>
              </span>
            </div>
          </div>

          <Link
            href="/registro"
            className="rounded border border-white/30 px-3 py-1 text-white/95 hover:border-[#33C7E3] hover:text-[#33C7E3]"
          >
            Registrarse
          </Link>
          <Link
            href="/ingreso"
            className="rounded border border-transparent bg-[#33C7E3] px-3 py-1 font-medium text-[#252f3f] hover:bg-[#2ab8d1]"
          >
            Inicia sesión
          </Link>
          <Link href={CATALOGO_HREF} className="text-white/90 hover:text-[#FFC600]">
            Catálogo
          </Link>
          <Link href="/buscar" className="text-white/70 hover:text-white">
            Búsqueda avanzada
          </Link>
        </nav>
      </div>
    </header>
  );
}
