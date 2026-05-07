import { Suspense } from "react";
import Link from "next/link";

import { LoginForm } from "@/components/auth/login-form";

export default function IngresoPage() {
  return (
    <div className="mx-auto flex min-h-[50vh] max-w-xl flex-col justify-center gap-6 px-4 py-16">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">Inicia sesión</h1>
        <p className="mt-2 text-neutral-600">
          Acceso con la misma cuenta que en Tasaciones Vedisa (Supabase compartido). Los administradores pueden gestionar
          usuarios y remates desde el panel.
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-neutral-500">Cargando formulario…</p>}>
        <LoginForm />
      </Suspense>
      <Link href="/" className="font-semibold text-[#33C7E3] hover:underline">
        ← Volver al inicio
      </Link>
    </div>
  );
}
