import Link from "next/link";

export default function RegistroPlaceholder() {
  return (
    <div className="mx-auto flex min-h-[50vh] max-w-xl flex-col justify-center gap-4 px-4 py-16">
      <h1 className="text-2xl font-bold text-neutral-900">Registrarse</h1>
      <p className="text-neutral-600">
        Próximo paso: formulario Supabase Auth y flujo de aprobación como postor. Esta vista es marcador de
        posición para el despliegue inicial en Vercel.
      </p>
      <Link href="/" className="font-semibold text-[#33C7E3] hover:underline">
        ← Volver al inicio
      </Link>
    </div>
  );
}
