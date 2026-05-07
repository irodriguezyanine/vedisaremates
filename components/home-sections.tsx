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

export function CtaRegisterBand() {
  const cat = catalogoHref();
  return (
    <section className="mx-auto max-w-3xl rounded-2xl border-2 border-[#FFC107] bg-[#f8fafc] px-6 py-10 text-center shadow-[0_10px_36px_rgba(255,193,7,0.35)] transition hover:-translate-y-0.5 hover:shadow-[0_14px_44px_rgba(255,193,7,0.45)]">
      <h2 className="text-2xl font-extrabold text-[#053247]">¿No estás registrado?</h2>
      <p className="mx-auto mt-4 max-w-xl text-neutral-700">
        Sin cuenta no podrás ofertar. Regístrate, deposita tu garantía y participa en remates 100% online.
      </p>
      <p className="mx-auto mt-3 max-w-xl text-sm text-neutral-600">
        Las exhibiciones en bodega son públicas y <strong>no requieren garantía</strong> para visitar.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-4">
        <Link
          href="/registro"
          className="inline-flex items-center justify-center rounded-full bg-[#4bc0f9] px-8 py-3 text-sm font-bold text-[#053247] shadow-md ring-1 ring-sky-200 hover:brightness-105"
        >
          Regístrate ahora
        </Link>
        <Link
          href={cat}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center rounded-full border-2 border-[#009ade] px-8 py-3 text-sm font-bold text-[#009ade] hover:bg-[#009ade] hover:text-white"
        >
          Ver catálogo
        </Link>
      </div>
    </section>
  );
}

export function RegisterPitch() {
  return (
    <section className="mx-auto max-w-2xl rounded-2xl border border-neutral-200 bg-white px-6 py-10 shadow-sm">
      <h2 className="text-2xl font-extrabold text-[#009ade]">¡Bienvenido al portal líder en remates!</h2>
      <p className="mt-3 font-semibold text-neutral-500">
        Registrarte es el primer paso para participar con seguridad.
      </p>

      <div className="mt-6 rounded-xl border border-sky-100 bg-sky-50/60 p-5">
        <p className="text-sm font-semibold text-neutral-800">Aviso sobre tu correo de activación</p>
        <p className="mt-2 text-sm leading-relaxed text-neutral-700">
          Algunos proveedores (p. ej. <mark className="rounded bg-amber-200 px-0.5">Hotmail</mark>) pueden demorar o
          filtrar correos automáticos. Para acceso inmediato y comprobantes,{" "}
          <strong>recomendamos Gmail o correo corporativo</strong>.
        </p>
      </div>

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
          <span className="font-bold text-[#009ade]">✓ Notificaciones</span> — alertas sobre intereses (próximamente
          personalizables).
        </li>
        <li>
          <span className="font-bold text-[#009ade]">✓ Soporte</span> — Contact Center acompaña tu proceso.
        </li>
      </ul>

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
