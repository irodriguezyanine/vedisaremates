import Link from "next/link";
import Image from "next/image";

import type { Metadata } from "next";

import { catalogoHref } from "@/lib/site-config";

export const metadata: Metadata = {
  title: "Cómo participar",
  description: "Pasos para registrarte, garantía, revisar lotes y ofertar en VEDISA Remates.",
};

export default function ComoParticiparPage() {
  const cat = catalogoHref();

  const steps = [
    {
      title: "1. Regístrate",
      body: (
        <>
          Crea tu cuenta en{" "}
          <Link href="/registro" className="font-bold text-[#009ade] hover:underline">
            registro
          </Link>{" "}
          y confirma tu correo.
        </>
      ),
      img: "https://img.icons8.com/color/96/user-male-circle.png",
      alt: "Registro",
    },
    {
      title: "2. Constituye tu garantía",
      body: (
        <>
          Escríbenos por{" "}
          <a
            href="https://wa.me/56989323397?text=Hola%2C%20quiero%20informaci%C3%B3n%20sobre%20la%20garant%C3%ADa"
            className="font-bold text-emerald-600 hover:underline"
          >
            WhatsApp
          </a>{" "}
          o revisa la sección{" "}
          <Link href="/faq" className="font-bold text-[#009ade] hover:underline">
            Ayuda
          </Link>
          .
        </>
      ),
      img: "https://img.icons8.com/color/96/money-bag.png",
      alt: "Garantía",
    },
    {
      title: "3. Revisa los lotes",
      body: (
        <>
          Explora el{" "}
          <Link href={cat} className="font-bold text-[#009ade] hover:underline" target="_blank">
            catálogo
          </Link>{" "}
          con fotos e información referencial.
        </>
      ),
      img: "https://img.icons8.com/color/96/car.png",
      alt: "Vehículos",
    },
    {
      title: "4. Oferta y adjudicación",
      body: "Oferta en línea según reglas del remate. Si resultas adjudicado, coordinamos pago y retiro.",
      img: "https://cdn-icons-png.flaticon.com/128/2162/2162183.png",
      alt: "Subasta",
    },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 text-center sm:px-6 lg:px-8">
      <h1 className="text-3xl font-black text-[#2980b9] md:text-4xl">¿Cómo participar en los remates?</h1>
      <p className="mx-auto mt-4 max-w-2xl text-lg text-neutral-600">
        Participar en nuestras subastas online es <strong>fácil y seguro</strong>. Sigue estos pasos:
      </p>

      <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((s) => (
          <div
            key={s.title}
            className="flex h-full flex-col rounded-2xl border-2 border-[#FFC107] bg-white p-6 shadow-[0_8px_28px_rgba(255,193,7,0.35)] transition hover:-translate-y-1 hover:shadow-[0_12px_36px_rgba(255,193,7,0.45)]"
          >
            <div className="relative mx-auto h-24 w-24">
              <Image src={s.img} alt={s.alt} fill className="object-contain" sizes="96px" />
            </div>
            <h2 className="mt-4 text-lg font-bold text-neutral-900">{s.title}</h2>
            <p className="mt-3 flex-1 text-left text-sm leading-relaxed text-neutral-700">{s.body}</p>
          </div>
        ))}
      </div>

      <div className="mt-14 flex flex-wrap justify-center gap-4">
        <Link
          href="/registro"
          className="rounded-full bg-[#009ade] px-8 py-3 text-sm font-bold text-white shadow hover:brightness-105"
        >
          Ir a registro
        </Link>
        <Link
          href="/terminos"
          className="rounded-full border-2 border-neutral-300 px-8 py-3 text-sm font-semibold hover:border-[#009ade]"
        >
          Leer términos
        </Link>
      </div>
    </div>
  );
}
