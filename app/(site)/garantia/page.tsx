import type { Metadata } from "next";
import Link from "next/link";

import { SITE, catalogoHref } from "@/lib/site-config";

export const metadata: Metadata = {
  title: "Constituir garantía",
  description: "Pago con tarjeta o transferencia para habilitar ofertas en VEDISA Remates.",
};

const PAYMENT_LINK = "https://www.tuu.cl/vedisaremates";

export default function GarantiaPage() {
  const cat = catalogoHref();

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-black text-[#1a2c4e]">Constituir garantía</h1>
      <p className="mt-2 text-sm text-neutral-600">
        Puede revisar catálogo sin garantía. Para ofertar, debe constituir una garantía de {SITE.guaranteeAmountDisplay}.
      </p>

      <div className="mt-6 rounded-2xl border border-sky-100 bg-sky-50/60 p-5">
        <p className="text-sm font-bold text-[#0f3d5c]">Pago con tarjeta</p>
        <p className="mt-1 text-sm text-neutral-700">Use el mismo nombre y correo de su cuenta en VEDISA Remates.</p>
        <Link
          href={PAYMENT_LINK}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex rounded-full bg-[#009ade] px-4 py-2 text-sm font-bold text-white hover:brightness-105"
        >
          Pagar garantía con tarjeta
        </Link>
      </div>

      <div className="mt-4 rounded-2xl border border-neutral-200 bg-white p-5">
        <p className="text-sm font-bold text-[#1a2c4e]">Transferencia bancaria</p>
        <div className="mt-2 space-y-1 text-sm text-neutral-700">
          <p>
            <strong>Razón social:</strong> VEDISA REMATES LIMITADA
          </p>
          <p>
            <strong>RUT:</strong> 76.114.336-0
          </p>
          <p>
            <strong>Cuenta corriente:</strong> 08490043006
          </p>
          <p>
            <strong>Banco:</strong> Banco de Chile
          </p>
          <p>
            <strong>Correo:</strong> {SITE.pagosEmail}
          </p>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-5">
        <p className="text-sm font-semibold text-amber-900">
          Envíe su comprobante por WhatsApp o correo para habilitar su cuenta.
        </p>
        <p className="mt-1 text-sm text-amber-900/90">Tiempo estimado de habilitación: menos de 1 hora en horario laboral.</p>
        <div className="mt-3 flex flex-wrap gap-3">
          <Link
            href={SITE.whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex rounded-full border border-emerald-400 bg-emerald-500 px-4 py-2 text-sm font-bold text-white hover:brightness-105"
          >
            Enviar por WhatsApp
          </Link>
          <Link
            href={`mailto:${SITE.pagosEmail}`}
            className="inline-flex rounded-full border border-neutral-300 bg-white px-4 py-2 text-sm font-bold text-neutral-800 hover:bg-neutral-50"
          >
            Enviar por correo
          </Link>
          <Link
            href={cat}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex rounded-full border border-[#009ade] bg-white px-4 py-2 text-sm font-bold text-[#009ade] hover:bg-[#009ade] hover:text-white"
          >
            Revisar catálogo
          </Link>
        </div>
      </div>
    </div>
  );
}
