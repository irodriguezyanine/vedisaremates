import Link from "next/link";

import { catalogoHref } from "@/lib/site-config";

export function TrustStrip() {
  const metrics = [
    { n: "+35", l: "Años trayectoria" },
    { n: "+100", l: "Vehículos / mes referencial" },
    { n: "+3.500", l: "Clientes atendidos" },
    { n: "100%", l: "Inventario digital" },
  ];
  return (
    <section className="relative overflow-hidden rounded-2xl bg-[#009ade] px-6 py-12 text-white shadow-[0_20px_45px_rgba(0,154,222,0.28)] md:py-14">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_24%_-10%,rgba(255,255,255,0.28),transparent_52%)]"
      />
      <div className="relative mx-auto grid max-w-5xl gap-8 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map((m) => (
          <div key={m.l} className="text-center">
            <p className="font-black leading-none tracking-tight sm:text-[2.75rem] text-[2.35rem]" style={{
              background: `linear-gradient(180deg,#ffe76a,#FFC107,#ffdd59)`,
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}>
              {m.n}
            </p>
            <p className="mt-2 text-xs font-bold uppercase tracking-widest text-white/90">{m.l}</p>
          </div>
        ))}
      </div>
      <p className="relative mt-8 text-center text-xs text-white/75">
        Cifras orientativas de operación — no constituyen oferta pública de resultados.
      </p>
    </section>
  );
}

export function RegisterPitch() {
  const cat = catalogoHref();

  return (
    <section className="mx-auto max-w-2xl rounded-2xl border border-neutral-200 bg-white px-6 py-10 shadow-sm">
      <h2 className="text-2xl font-extrabold text-[#009ade]">¡Bienvenido al portal líder en remates!</h2>
      <p className="mt-3 font-semibold text-neutral-500">
        Registrarte es el primer paso para participar con seguridad.
      </p>

      <h3 className="mt-8 text-lg font-bold text-neutral-800">Al crear tu cuenta obtienes</h3>
      <ul className="mt-4 space-y-3 text-[15px] text-neutral-700">
        <li>
          <span className="font-bold text-[#009ade]">✓ Acceso completo</span> — fotos, video, informes y detalle de
          lotes.
        </li>
        <li>
          <span className="font-bold text-[#009ade]">✓ Garantía de participación</span> — derecho a ofertar en
          remates habilitados.
        </li>
        <li>
          <span className="font-bold text-[#009ade]">✓ Soporte</span> — Contact Center acompaña tu proceso.
        </li>
      </ul>

      <div className="mt-8 rounded-xl border border-[#FFC107]/40 bg-[#f8fafc] p-5">
        <h3 className="text-lg font-extrabold text-[#053247]">¿No está registrado?</h3>
        <p className="mt-2 text-sm text-neutral-700">
          Sin cuenta no podrá ofertar. Regístrese, deposite su garantía y participe en remates 100% online.
        </p>
        <p className="mt-2 text-sm text-neutral-600">
          Las exhibiciones en bodega son públicas y <strong>no requieren garantía</strong> para visitar.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href="#crear-cuenta-portal"
            className="inline-flex items-center justify-center rounded-full bg-[#4bc0f9] px-6 py-2.5 text-sm font-bold text-[#053247] shadow-sm ring-1 ring-sky-200 hover:brightness-105"
          >
            Crear cuenta ahora
          </Link>
          <Link
            href={cat}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center rounded-full border-2 border-[#009ade] px-6 py-2.5 text-sm font-bold text-[#009ade] hover:bg-[#009ade] hover:text-white"
          >
            Ver catálogo
          </Link>
        </div>
      </div>

      <p className="mt-8 border-t border-neutral-200 pt-5 text-xs text-neutral-500">
        *Al registrarte aceptas los{" "}
        <Link href="/terminos" className="font-semibold text-[#009ade] hover:underline">
          términos
        </Link>{" "}
        y la{" "}
        <Link href="/privacidad" className="font-semibold text-[#009ade] hover:underline">
          política de privacidad
        </Link>
        .
      </p>
    </section>
  );
}
