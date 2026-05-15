import Link from "next/link";

import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export default function RecuperarClavePage() {
  return (
    <div className="mx-auto flex min-h-[50vh] max-w-xl flex-col justify-center gap-6 px-4 py-16">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">¿Se te olvidó la contraseña?</h1>
        <p className="mt-2 text-neutral-600">
          Ingresa tu correo o nombre de usuario y te enviaremos un enlace seguro para cambiar tu contraseña.
        </p>
      </div>
      <ForgotPasswordForm />
      <Link href="/ingreso" className="font-semibold text-[#33C7E3] hover:underline">
        ← Volver a ingreso
      </Link>
    </div>
  );
}
