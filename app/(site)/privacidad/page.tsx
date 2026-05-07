import type { Metadata } from "next";

import Link from "next/link";

export const metadata: Metadata = {
  title: "Política de privacidad",
  description: "Información sobre tratamiento de datos personales en el portal VEDISA Remates.",
};

export default function PrivacidadPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold text-[#1a2c4e]">Política de privacidad</h1>
      <p className="mt-6 text-sm leading-relaxed text-neutral-700">
        Este sitio moderniza la experiencia Vedisa. Los datos personales se tratarán conforme a la normativa chilena de
        protección de datos y a las finalidades informadas al registrarte (identificación, garantías, ofertas,
        notificaciones operativas).
      </p>
      <ul className="mt-6 list-disc space-y-2 pl-6 text-sm text-neutral-700">
        <li>Conservamos registros mientras la relación contractual o legal lo requiera.</li>
        <li>Puedes solicitar rectificación o aclaración canalizando por Contact Center.</li>
        <li>Usamos cookies técnicas necesarias; analíticas sólo con tu consentimiento donde aplique.</li>
      </ul>
      <p className="mt-8 text-sm text-neutral-600">
        Texto abreviado de referencia legal. Debe ser revisado por asesoría Vedisa antes de publicación definitiva.
      </p>
      <p className="mt-8">
        <Link href="/terminos" className="font-semibold text-[#009ade] hover:underline">
          Volver a términos y condiciones
        </Link>
      </p>
    </div>
  );
}
