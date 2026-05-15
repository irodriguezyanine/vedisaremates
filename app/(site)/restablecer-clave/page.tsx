import Link from "next/link";

import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export default function RestablecerClavePage() {
  return (
    <div className="mx-auto flex min-h-[50vh] max-w-xl flex-col justify-center gap-6 px-4 py-16">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">Restablecer contraseña</h1>
        <p className="mt-2 text-neutral-600">Define una nueva contraseña para tu cuenta de VEDISA Remates.</p>
      </div>
      <ResetPasswordForm />
      <Link href="/ingreso" className="font-semibold text-[#33C7E3] hover:underline">
        ← Volver a ingreso
      </Link>
    </div>
  );
}
