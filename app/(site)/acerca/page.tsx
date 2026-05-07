import Image from "next/image";
import Link from "next/link";

import type { Metadata } from "next";

import { Reveal } from "@/components/reveal-on-scroll";
import { TrustStrip } from "@/components/home-sections";
import { catalogoHref } from "@/lib/site-config";

export const metadata: Metadata = {
  title: "Acerca de Vedisa",
  description: "Historia, categorías, valores y trayectoria corporativa VEDISA Remates.",
};

const scope = [
  {
    title: "Vehículos livianos",
    desc: "Automóviles, SUVs y camionetas particulares.",
    img: "https://img.icons8.com/fluency/96/sedan.png",
    alt: "Sedán",
  },
  {
    title: "Flotas corporativas",
    desc: "Furgones, camionetas operativas y unidades de servicio.",
    img: "https://img.icons8.com/fluency/96/pickup.png",
    alt: "Pickup",
  },
  {
    title: "Camiones y grúas",
    desc: "Transporte de carga pesada y equipamiento especial.",
    img: "https://img.icons8.com/fluency/96/truck.png",
    alt: "Camión",
  },
  {
    title: "Maquinaria",
    desc: "Equipos industriales, agrícolas y de construcción.",
    img: "https://img.icons8.com/fluency/96/excavator.png",
    alt: "Maquinaria",
  },
];

export default function AcercaPage() {
  const cat = catalogoHref();

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
      <Reveal className="text-center">
        <h1 className="text-4xl font-black uppercase tracking-tight text-[#009ade] md:text-[2.8rem]">
          Vedisa <span className="text-[#FFC107]">Remates</span>
        </h1>
        <div className="mx-auto mt-4 h-1 w-16 rounded-full bg-[#FFC107]" aria-hidden />
        <p className="mx-auto mt-6 max-w-3xl text-lg text-neutral-600">
          Expertos en gestión de activos corporativos y maximizar recupero. Transformamos flotas, maquinaria y
          vehículos en capital líquido con agilidad, tecnología, transparencia y más de tres décadas de trayectoria.
        </p>
      </Reveal>

      <Reveal className="mt-14">
        <TrustStrip />
      </Reveal>

      <Reveal className="mt-16">
        <p className="text-center text-xs font-bold uppercase tracking-[0.2em] text-neutral-400">
          Nuestras categorías de subasta
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-5">
          {scope.map((s) => (
            <div
              key={s.title}
              className="flex max-w-[220px] flex-1 basis-[180px] flex-col items-center rounded-xl border border-neutral-200 bg-white p-6 text-center shadow-[0_10px_30px_rgba(0,0,0,0.05)] transition hover:-translate-y-2 hover:border-b-4 hover:border-b-[#FFC107]"
            >
              <div className="relative h-14 w-14">
                <Image src={s.img} alt={s.alt} fill className="object-contain" sizes="56px" />
              </div>
              <h2 className="mt-4 text-base font-bold text-[#009ade]">{s.title}</h2>
              <p className="mt-2 text-sm text-neutral-600">{s.desc}</p>
            </div>
          ))}
        </div>
      </Reveal>

      <Reveal className="mt-12">
        <div className="mx-auto max-w-3xl rounded-2xl border-2 border-dashed border-[#FFC107] bg-gradient-to-r from-sky-50 to-white px-6 py-8 text-center transition hover:scale-[1.01] hover:border-solid">
          <h2 className="text-xl font-black uppercase text-[#009ade]">
            Recibimos todo estado <span className="ml-2 rounded bg-[#FFC107] px-2 py-0.5 text-xs text-neutral-900">sin excepción</span>
          </h2>
          <p className="mt-3 text-neutral-600">Operativos, siniestrados, en pana, quemados o chatarra.</p>
        </div>
      </Reveal>

      <Reveal className="mt-16 grid gap-8 md:grid-cols-3">
        {[
          {
            t: "Nuestra misión",
            i: "https://img.icons8.com/fluency/48/target.png",
            d: "Maximizar el recupero para proveedores y transparencia para compradores.",
          },
          {
            t: "Nuestra visión",
            i: "https://img.icons8.com/fluency/48/vision.png",
            d: "Ser el referente tecnológico en Chile para venta de activos asegurados y corporativos.",
          },
          {
            t: "Nuestra promesa",
            i: "https://img.icons8.com/fluency/48/handshake.png",
            d: "Seguridad operativa y servicio integral llave en mano para empresas y particulares.",
          },
        ].map((v) => (
          <div key={v.t} className="flex gap-4 rounded-2xl border border-neutral-100 bg-white p-6 shadow-sm hover:border-[#009ade]/40">
            <div className="relative h-14 w-14 shrink-0">
              <Image src={v.i} alt="" fill className="object-contain" sizes="56px" />
            </div>
            <div>
              <h3 className="font-bold text-[#009ade]">{v.t}</h3>
              <p className="mt-2 text-sm text-neutral-600">{v.d}</p>
            </div>
          </div>
        ))}
      </Reveal>

      <Reveal className="mt-16 flex flex-wrap items-center gap-10 rounded-3xl border border-sky-100 bg-sky-50/50 p-10">
        <div className="relative mx-auto h-40 w-40 shrink-0 rounded-full border-4 border-white shadow-lg md:mx-0">
          <Image
            src="https://img.icons8.com/fluency/200/manager.png"
            alt="Trayectoria equipo"
            fill
            className="rounded-full bg-white object-cover p-4"
            sizes="160px"
          />
        </div>
        <div className="min-w-[240px] flex-1">
          <h2 className="text-2xl font-bold text-[#009ade]">Nuestra trayectoria</h2>
          <p className="mt-4 text-sm leading-relaxed text-neutral-700">
            Fundada por el martillero público <strong>Juan Pablo Montero Lira</strong>, Vedisa evolucionó de casa de
            remates tradicional a plataforma digital. Hoy articulamos inventario para seguros, leasing, renting y
            transporte en todo el país, con trazabilidad y foco en el comprador final.
          </p>
        </div>
      </Reveal>

      <div className="mt-16 flex flex-wrap justify-center gap-4">
        <Link
          href={cat}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full bg-[#FFC107] px-10 py-4 text-base font-bold text-neutral-900 shadow-md hover:bg-[#009ade] hover:text-white"
        >
          Ver catálogo actual
        </Link>
        <Link
          href="/como-participar"
          className="rounded-full border-2 border-[#009ade] px-10 py-4 text-base font-bold text-[#009ade] hover:bg-[#009ade] hover:text-white"
        >
          Cómo participar
        </Link>
      </div>
    </div>
  );
}
