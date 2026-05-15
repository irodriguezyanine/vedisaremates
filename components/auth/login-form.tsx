"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useState } from "react";

import { PasswordInput } from "@/components/auth/password-input";
import { createClient } from "@/lib/supabase/client";

function mapAuthError(message: string): string {
  const text = String(message ?? "").toLowerCase();
  if (!text) return "Credenciales inválidas. Revisa tu correo/nombre de usuario y contraseña.";
  if (text.includes("email not confirmed")) {
    return "Tu correo aún no está verificado. Revisa tu bandeja o solicita reenvío de verificación.";
  }
  if (text.includes("invalid login credentials") || text.includes("invalid_grant")) {
    return "Credenciales inválidas. Revisa tu correo/nombre de usuario y contraseña.";
  }
  if (text.includes("too many requests")) {
    return "Demasiados intentos. Espera unos minutos e inténtalo nuevamente.";
  }
  return message;
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") ?? "/subastas";

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const supabase = createClient();
      if (!supabase) {
        setError("El ingreso web no está disponible en este entorno. Probá más tarde o contactá soporte Vedisa.");
        return;
      }
      let emailForLogin = identifier.trim();
      if (!emailForLogin) {
        setError("Ingresa tu correo o nombre de usuario.");
        return;
      }

      if (!emailForLogin.includes("@")) {
        const resolveRes = await fetch("/api/auth/login/resolve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ identifier: emailForLogin }),
        });
        const resolveData = (await resolveRes.json().catch(() => ({}))) as { ok?: boolean; email?: string };
        if (!resolveRes.ok || !resolveData?.ok || !resolveData?.email || !resolveData.email.includes("@")) {
          setError("Credenciales inválidas. Revisa tu correo/nombre de usuario y contraseña.");
          return;
        }
        emailForLogin = resolveData.email.toLowerCase();
      } else {
        emailForLogin = emailForLogin.toLowerCase();
      }

      const { error: signErr } = await supabase.auth.signInWithPassword({ email: emailForLogin, password });
      if (signErr) {
        setError(mapAuthError(signErr.message));
        return;
      }
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.email_confirmed_at) {
        await supabase.auth.signOut();
        setError("Tu correo aún no está verificado. Revisa tu bandeja y confirma tu cuenta antes de ingresar.");
        return;
      }
      if (user?.id) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("must_change_password")
          .eq("id", user.id)
          .maybeSingle();
        if (profile?.must_change_password) {
          router.refresh();
          router.push("/mi-cuenta");
          return;
        }
      }
      router.refresh();
      router.push(redirect.startsWith("/") ? redirect : "/subastas");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <label className="block text-sm font-medium text-neutral-700">
        Correo o nombre de usuario
        <input
          type="text"
          autoComplete="username"
          required
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          placeholder="correo@dominio.cl o usuario"
          className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-neutral-900 shadow-sm focus:border-[#33C7E3] focus:outline-none focus:ring-1 focus:ring-[#33C7E3]"
        />
      </label>
      <PasswordInput label="Contraseña" value={password} onChange={setPassword} required autoComplete="current-password" />
      <p className="-mt-1 text-right text-sm">
        <Link href="/recuperar-clave" className="font-semibold text-[#009ade] hover:underline">
          ¿Se te olvidó la contraseña?
        </Link>
      </p>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <button
        type="submit"
        disabled={loading}
        className="rounded-lg bg-gradient-to-r from-[#33C7E3] to-[#2ab0c9] px-4 py-3 text-sm font-bold text-[#0f1f2c] shadow-md hover:brightness-105 disabled:opacity-60"
      >
        {loading ? "Entrando…" : "Entrar"}
      </button>
      <p className="text-sm text-neutral-600">
        ¿No tienes cuenta?{" "}
        <Link href="/registro" className="font-semibold text-[#009ade] hover:underline">
          Registrarse
        </Link>
      </p>
    </form>
  );
}
