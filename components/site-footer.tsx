import Link from "next/link";

import { catalogoHref, SITE } from "@/lib/site-config";

import { SocialShareBar } from "./social-share-bar";

const link = "text-neutral-600 transition hover:text-[#009ade]";

export function SiteFooter() {
  const cat = catalogoHref();

  return (
    <footer className="mt-auto border-t border-neutral-200 bg-[#f7f9fb] text-neutral-700">
      <SocialShareBar />

      <div className="mx-auto max-w-7xl space-y-8 px-4 py-12 text-sm sm:px-6 lg:px-8">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-base font-black text-[#1a2c4e]">{SITE.name}</p>
            <p className="mt-2 text-xs leading-relaxed text-neutral-600">
              Información referencial con fotos y video. Exhibición presencial en bodega antes de rematar.
            </p>
          </div>
          <div>
            <p className="mb-3 text-xs font-bold uppercase tracking-wider text-neutral-400">Explorar</p>
            <ul className="space-y-2">
              <li>
                <Link href={cat} target="_blank" rel="noopener noreferrer" className={link}>
                  Catálogo
                </Link>
              </li>
              <li>
                <Link href="/como-participar" className={link}>
                  Cómo participar
                </Link>
              </li>
              <li>
                <Link href="/buscar" className={link}>
                  Búsqueda avanzada
                </Link>
              </li>
              <li>
                <Link href="/mapa" className={link}>
                  Mapa del sitio
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <p className="mb-3 text-xs font-bold uppercase tracking-wider text-neutral-400">Legal</p>
            <ul className="space-y-2">
              <li>
                <Link href="/terminos" className={link}>
                  Términos y condiciones
                </Link>
              </li>
              <li>
                <Link href="/privacidad" className={link}>
                  Política de privacidad
                </Link>
              </li>
              <li>
                <Link href="/faq" className={link}>
                  Ayuda / FAQ
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <p className="mb-3 text-xs font-bold uppercase tracking-wider text-neutral-400">Contacto</p>
            <ul className="space-y-2 text-neutral-600">
              <li>
                <a className={link} href={SITE.whatsappHref}>
                  WhatsApp {SITE.contactPhoneDisplay}
                </a>
              </li>
              <li>
                <Link href="/contacto" className={link}>
                  Formulario y horarios
                </Link>
              </li>
              <li>
                <a className={link} href={`mailto:${SITE.pagosEmail}`}>
                  {SITE.pagosEmail}
                </a>
              </li>
            </ul>
          </div>
        </div>

        <p className="text-xs leading-relaxed text-neutral-600">
          La información publicada es referencial. Los vehículos se exhiben para verificar estado en forma
          presencial. <strong className="text-neutral-800">{SITE.name}</strong> garantiza lo publicado en
          recinto; retirado de bodegas implica aceptación conforme, sin reclamos posteriores por estado ni
          equipamiento.
        </p>

        <div className="flex flex-wrap gap-6 border-y border-neutral-200 py-6 text-sm">
          <p>
            <strong>Oficinas:</strong> Américo Vespucio 2880, Piso 7
          </p>
          <p>
            <strong>Exhibición:</strong> Arturo Prat 6457, Noviciado, Pudahuel
          </p>
          <p>
            <strong>Horario:</strong> Lun–Vie 9:00–13:00 / 14:00–17:00 · Sáb–Dom cerrado
          </p>
        </div>

        <p className="rounded-lg border border-[#33C7E3]/30 bg-white px-4 py-3 text-center text-sm text-neutral-700 shadow-sm">
          <span className="text-emerald-600" aria-hidden>
            ✓
          </span>{" "}
          <strong>Remates 100% online:</strong> puede revisar unidades pre‑compra en bodega sin garantía.
        </p>

        <p className="text-center text-xs text-neutral-500">
          © {new Date().getFullYear()} {SITE.name}. Todos los derechos reservados.
        </p>
      </div>
    </footer>
  );
}
