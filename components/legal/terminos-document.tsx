import Link from "next/link";
import type { ReactNode } from "react";

function H3({ children }: { children: ReactNode }) {
  return (
    <h3 className="mt-10 scroll-mt-24 border-b border-neutral-200 pb-2 text-lg font-bold text-[#17a2b8] first:mt-0">
      {children}
    </h3>
  );
}

export function TerminosDocument() {
  return (
    <article className="max-w-none text-[15px] leading-relaxed text-neutral-700">
      <header className="not-prose rounded-t-xl border border-b-0 border-neutral-200 bg-[#f7f7f7] px-6 py-5">
        <h1 className="text-xl font-bold text-[#009ade] md:text-2xl">Términos y condiciones generales de participación</h1>
        <p className="mt-2 text-sm text-neutral-600">
          Al registrarse y participar en las subastas de Vedisa Remates, usted acepta estas condiciones.{" "}
          <Link href="/contacto" className="font-semibold text-[#009ade] hover:underline">
            ¿Dudas? Contáctenos
          </Link>
          .
        </p>
      </header>

      <div className="rounded-b-xl border border-t-0 border-neutral-200 bg-white px-6 py-8 shadow-sm">
        <H3>1. Costos y comisiones</H3>
        <ul className="mt-4 list-disc space-y-2 pl-5 marker:text-neutral-400">
          <li>
            <strong className="text-[#009ade]">Comisión comprador:</strong> 12% + IVA.
          </li>
          <li>
            Además del valor adjudicado y la comisión, el comprador cancela gastos de administración y
            transferencia por <strong>$150.000</strong> más impuesto correspondiente (1,5% de tasación fiscal).
          </li>
          <li>Si el vehículo es solo para desarme: solo dichos gastos de administración y transferencia.</li>
          <li>
            <strong>Exención:</strong> ventas adjudicadas bajo $300.000 quedan libres de ese costo, según
            condiciones vigentes publicadas en portal.
          </li>
          <li>
            Vehículos marcados como <strong>&quot;SOLO PARA DESARME&quot;</strong> se venden con patentes dadas de
            baja y circulación prohibida; pueden ser afectos a IVA sobre el valor ofertado.
          </li>
        </ul>

        <H3>2. Condición y estado de los vehículos</H3>
        <ul className="mt-4 list-disc space-y-2 pl-5">
          <li>Los vehículos provienen de siniestros de compañías de seguros.</li>
          <li>Se venden en el estado que se encuentran; el comprador debe verificar físicamente en exhibición.</li>
          <li>
            La exhibición en bodegas tiene ventanas publicadas — confirme en Contact Center antes de ir.
          </li>
          <li>Fotografías y video son referencia complementaria.</li>
          <li>Válida siempre la <strong>última información publicada</strong> en el portal antes del cierre.</li>
        </ul>

        <H3>3. Situación legal y multas</H3>
        <ul className="mt-4 list-disc space-y-2 pl-5">
          <li>Información de prohibición de dominio según certificado disponible hasta la fecha informada.</li>
          <li>Multas de tránsito conocidas pueden informarse en ficha del vehículo.</li>
          <li>Las que aparezcan en RC posteriores al remate son <strong>cargo del comprador</strong>.</li>
          <li>
            Sus ofertas máximas se tratan como <strong>confidenciales</strong>; el sistema oferta automático
            hasta ese tope ante competencia.
          </li>
        </ul>

        <H3>4. Vehículos condicionados (PROSE)</H3>
        <p className="mt-4 rounded-lg bg-amber-50 p-4 text-sm ring-1 ring-amber-200">
          Marcados como <strong>&quot;CONDICIONADOS&quot;</strong>: venta puede estar sujeta a prohibición de actos/
          contratos hasta inspección. Responsabilidad de inspección y levantamiento según instructivo PROSE,
          predominantemente años <strong>2019 en adelante</strong> en una lista que incluye pickups y SUVs de
          varias marcas (Chevrolet, Ford, Jeep, Kia, Mercedes, Mitsubishi, Nissan, Toyota, SSangyong, etc.).
        </p>

        <H3>5. Plazos de pago, retiro y sanciones</H3>
        <ul className="mt-4 list-disc space-y-2 pl-5">
          <li>Una vez adjudicado el lote hay <strong>48 horas</strong> para pago íntegro y coordinación.</li>
          <li>Incumplimiento puede significar pérdida de <strong>garantía depositada</strong>.</li>
          <li>Hasta <strong>3 días hábiles</strong> típicos para retiro — confirme condición publicada del evento.</li>
          <li>
            Retraso en retiro puede generar <strong>recargo de bodegaje</strong> ($20.000 + IVA u monto vigente).
          </li>
        </ul>

        <H3>6. Reglas de oferta y funcionamiento</H3>
        <p className="mt-4">Incrementos mínimos orientativos según tramo de precio actual:</p>
        <div className="not-prose mt-4 overflow-x-auto rounded-lg border border-sky-100 bg-sky-50/90">
          <table className="w-full min-w-[280px] text-left text-sm">
            <thead>
              <tr className="border-b border-sky-100 bg-white/70">
                <th className="px-4 py-2 font-semibold text-neutral-800" scope="col">
                  Precio vigente del lote
                </th>
                <th className="px-4 py-2 font-semibold text-neutral-800" scope="col">
                  Incremento mínimo
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sky-100">
              <tr>
                <td className="px-4 py-2">0 a $200.000</td>
                <td className="px-4 py-2 font-semibold text-[#009ade]">$20.000</td>
              </tr>
              <tr>
                <td className="px-4 py-2">$201.000 a $1.000.000</td>
                <td className="px-4 py-2 font-semibold text-[#009ade]">$50.000</td>
              </tr>
              <tr>
                <td className="px-4 py-2">$1.000.001 a $5.000.000</td>
                <td className="px-4 py-2 font-semibold text-[#009ade]">$100.000</td>
              </tr>
              <tr>
                <td className="px-4 py-2">$5.000.001 a $10.000.000</td>
                <td className="px-4 py-2 font-semibold text-[#009ade]">$200.000</td>
              </tr>
              <tr>
                <td className="px-4 py-2">$10.000.001 o más</td>
                <td className="px-4 py-2 font-semibold text-[#009ade]">$300.000</td>
              </tr>
            </tbody>
          </table>
        </div>
        <ul className="mt-6 list-disc space-y-2 pl-5">
          <li>
            Ofertas en los últimos minutos pueden extender el cierre <strong>120 segundos</strong>
            automáticamente (anti-sniping).
          </li>
          <li>
            Vedisa puede anular adjudicaciones si hay caídas de sistema o eventos fuera del concepto justo de
            subasta, según reglamento técnico.
          </li>
          <li>La casa puede suspender lotes antes del cierre por instrucciones de la compañía de seguros.</li>
        </ul>

        <H3>7. Garantía y devolución</H3>
        <ul className="mt-4 list-disc space-y-2 pl-5">
          <li>Garantía de participación habitual <strong>$300.000</strong> antes de puja.</li>
          <li>Si no adjudica, devolución en plazo comunicado antes del término del remate según proceso vigente.</li>
        </ul>

        <H3>8. Transferencia y responsabilidad</H3>
        <ul className="mt-4 list-disc space-y-2 pl-5">
          <li>
            Solicitud de transferencia presentada dentro de hasta <strong>10 días hábiles</strong> tras
            facturación; tramitación ante Registro Civil es ajena al plazo institucional.
          </li>
          <li>El comprador declara tener facultades legales, incluida Ley 21.386 (RNPA).</li>
          <li>Si hubiera impedimento atribuible al comprador, debe proponer nuevo comprador costeando tributos aplicables.</li>
        </ul>

        <H3>9. Anulación unilateral por fuerza mayor</H3>
        <p className="mt-4 rounded-lg bg-red-50/80 p-4 text-sm ring-1 ring-red-100">
          Catástrofes naturales, ciberataques o cortes de energía que impidan igualdad pueden motivar{" "}
          <strong>anulación del remate</strong> conforme política públicamente informada por Vedisa para proteger la
          subasta como acto público regulado.
        </p>

        <p className="not-prose mt-10 rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-xs text-neutral-600">
          Texto compilado desde condiciones públicas Vedisa Rainworks/CMS y adaptado sin perder efectos prácticos
          esperados por el cliente. Vedisa debe validar contenido antes de usarlo formalmente ante notario o cliente
          final.
        </p>
      </div>
    </article>
  );
}
