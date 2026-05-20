import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { LoginForm } from "@/components/auth/login-form";
import { createClient } from "@/lib/supabase/server";

export default async function IngresoPage() {
  const supabase = await createClient();
  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user?.email_confirmed_at) {
      redirect("/");
    }
  }

  return (
    <div className="mx-auto flex min-h-[50vh] max-w-xl flex-col justify-center gap-6 px-4 py-16">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">Inicia sesión</h1>
        <p className="mt-2 text-neutral-600">
          Ingrese con su correo o nombre de usuario y su contraseña. Los clientes remate pueden gestionar su perfil y ver
          sus ofertas en &quot;Mi cuenta&quot; una vez dentro.
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
