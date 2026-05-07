import type { Metadata } from "next";
import Link from "next/link";

import { CtaRegisterBand, RegisterPitch } from "@/components/home-sections";
import { Reveal } from "@/components/reveal-on-scroll";

export const metadata: Metadata = {
  title: "Registrarse",
  description: "Crea tu cuenta en VEDISA Remates, garantía y participación en subastas online.",
};

export default function RegistroPage() {
  return (
    <div className="bg-gradient-to-b from-[#e8f4fc] via-[#fdfefe] to-white pb-16 pt-10">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-10 flex flex-col gap-2 border-b border-neutral-200 pb-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-black text-neutral-900">Registrarse</h1>
            <p className="mt-2 max-w-xl text-neutral-600">
              Aquí tendrás el formulario con Supabase cuando lo conectemos. Mientras tanto, revisá los requisitos y
              beneficios de tener cuenta en el portal.
            </p>
          </div>
          <Link
            href="/"
            className="text-sm font-semibold text-[#009ade] hover:underline shrink-0"
          >
            ← Volver al inicio
          </Link>
        </div>

        <Reveal className="grid gap-12 lg:grid-cols-2 lg:items-start">
          <CtaRegisterBand />
          <RegisterPitch />
        </Reveal>
      </div>
    </div>
  );
}
