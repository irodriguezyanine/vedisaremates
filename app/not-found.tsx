import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center bg-gradient-to-b from-sky-50 to-white px-4 text-center">
      <p className="text-sm font-bold uppercase tracking-[0.35em] text-[#009ade]">VEDISA Remates</p>
      <h1 className="mt-4 text-7xl font-black text-[#1a2c4e]">404</h1>
      <p className="mt-4 max-w-md text-lg text-neutral-600">No encontramos la página. Quizá el remate ya cerró o movimos el enlace.</p>
      <div className="mt-10 flex flex-wrap justify-center gap-4">
        <Link
          href="/"
          className="rounded-full bg-[#FFC107] px-8 py-3 text-sm font-bold text-neutral-900 shadow hover:brightness-105"
        >
          Volver al inicio
        </Link>
        <Link href="/faq" className="rounded-full border-2 border-neutral-300 px-8 py-3 text-sm font-semibold hover:border-[#009ade]">
          Ayuda / FAQ
        </Link>
      </div>
    </div>
  );
}
