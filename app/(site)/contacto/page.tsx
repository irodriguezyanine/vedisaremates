import type { Metadata } from "next";
import Link from "next/link";

import { HubSpotForm } from "@/components/hubspot-form";
import { SITE } from "@/lib/site-config";

export const metadata: Metadata = {
  title: "Contáctenos",
  description: "Teléfono, bodega, oficina y formulario de contacto VEDISA Remates.",
};

export default function ContactoPage() {
  const region = process.env.NEXT_PUBLIC_HUBSPOT_REGION;
  const portalId = process.env.NEXT_PUBLIC_HUBSPOT_PORTAL_ID;
  const formId = process.env.NEXT_PUBLIC_HUBSPOT_FORM_ID;
  const hubspotConfigured = Boolean(region && portalId && formId);

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
      <h1 className="text-center text-3xl font-black text-[#1a2c4e]">Contáctenos</h1>

      <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            icon: "📞",
            title: "Contact Center",
            body: (
              <a className="font-bold text-[#1a2c4e] hover:underline" href={SITE.whatsappHref}>
                {SITE.contactPhoneDisplay}
              </a>
            ),
          },
          {
            icon: "📍",
            title: "Bodega exhibición",
            body: (
              <>
                Arturo Prat 6457
                <br />
                Noviciado, Pudahuel
              </>
            ),
          },
          {
            icon: "🏢",
            title: "Oficina",
            body: (
              <>
                Américo Vespucio 2880, Piso 7
                <br />
                Santiago
              </>
            ),
          },
          {
            icon: "🕘",
            title: "Horario",
            body: "Lun a Vie — 9:30 a 17:00 (confirmar víspera de feriados)",
          },
        ].map((c) => (
          <div
            key={c.title}
            className="rounded-xl border border-neutral-200 bg-white p-5 text-center shadow-sm transition hover:-translate-y-1 hover:shadow-md"
          >
            <span className="text-3xl" aria-hidden>
              {c.icon}
            </span>
            <h2 className="mt-2 text-lg font-bold text-[#1a2c4e]">{c.title}</h2>
            <p className="mt-2 text-sm text-neutral-600">{c.body}</p>
          </div>
        ))}
      </div>

      <div className="mt-12 rounded-2xl border border-dashed border-[#FFC107] bg-amber-50/40 p-6 text-center text-sm text-neutral-700">
        ¿Pagos o comprobante de garantía? —{" "}
        <a href={`mailto:${SITE.pagosEmail}`} className="font-bold text-emerald-700 hover:underline">
          {SITE.pagosEmail}
        </a>
      </div>

      {hubspotConfigured ? (
        <HubSpotForm region={region as string} portalId={portalId as string} formId={formId as string} />
      ) : (
        <div className="mt-8 rounded-xl border border-neutral-200 bg-neutral-50 p-6 text-center text-sm text-neutral-600">
          El formulario de contacto no está disponible en este momento. Escríbenos por WhatsApp o al correo de pagos y te
          ayudamos.
        </div>
      )}

      <p className="mt-8 text-center text-sm text-neutral-500">
        También puede revisar la <Link href="/faq" className="font-semibold text-[#009ade] hover:underline">sección Ayuda</Link>.
      </p>
    </div>
  );
}
