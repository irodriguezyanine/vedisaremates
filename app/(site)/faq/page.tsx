import type { Metadata } from "next";

import { CopyButton } from "@/components/copy-button";
import { FAQ_ITEMS } from "@/content/faq";
import { SITE } from "@/lib/site-config";

export const metadata: Metadata = {
  title: "Ayuda y preguntas frecuentes",
  description: "Cómo pagar garantía, activar cuenta, exhibición y soporte VEDISA Remates.",
};

const BANK_LINES = `Banco de Chile
Tipo: Cuenta corriente
N° 08490043006
RUT 76.114.336-0
Razón social: Vedisa Remates
Correo: pagos@vedisaremates.cl`;

export default function FaqPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
      <header className="rounded-t-xl border border-b-0 border-neutral-200 bg-[#f7f7f7] px-6 py-5">
        <h1 className="text-2xl font-bold text-[#1a2c4e]">Resolver un problema / FAQ</h1>
        <p className="mt-2 text-sm text-neutral-600">
          Si tu consulta no aparece aquí, escribe al{" "}
          <strong className="text-[#009ade]">
            Contact Center {SITE.contactPhoneDisplay}
          </strong>
          .
        </p>
      </header>

      <div className="space-y-3 rounded-b-xl border border-t-0 border-neutral-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 rounded-lg bg-neutral-50 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="text-neutral-700">Datos cuenta garantía (copiar y pegar)</p>
          <CopyButton text={BANK_LINES} label="Copiar datos bancarios" />
        </div>

        {FAQ_ITEMS.map((item, i) => (
          <details
            key={item.q}
            className="group rounded-lg border border-neutral-200 bg-white open:border-[#009ade]/40 open:bg-sky-50/30"
          >
            <summary className="cursor-pointer list-none px-4 py-4 font-semibold text-[#0077cc] outline-none marker:content-none [&::-webkit-details-marker]:hidden [&::after]:hidden">
              <span className="flex items-start justify-between gap-3">
                <span>
                  {i + 1}. {item.q}
                </span>
                <span className="text-neutral-400 transition group-open:rotate-180" aria-hidden>
                  ▾
                </span>
              </span>
            </summary>
            <div className="border-t border-neutral-100 px-5 pb-5 pt-2 text-sm text-neutral-700">{item.body}</div>
          </details>
        ))}
      </div>
    </div>
  );
}
