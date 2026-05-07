"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { createClient } from "@/lib/supabase/client";

export function RegisterForm() {
  const router = useRouter();
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);
    try {
      const supabase = createClient();
      if (!supabase) {
        setError(
          "Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY en el despliegue. Configúralas en Vercel (Environment Variables) y redesplegar.",
        );
        return;
      }
      const { error: signErr } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { nombre: nombre.trim() || undefined },
          emailRedirectTo: typeof window !== "undefined" ? `${window.location.origin}/ingreso` : undefined,
        },
      });
      if (signErr) {
        setError(signErr.message);
        return;
      }
      setMessage(
        "Si tu proyecto Supabase requiere confirmación por correo, revisá tu bandeja. También podés iniciar sesión cuando la cuenta esté activa.",
      );
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-bold text-neutral-900">Crear cuenta en el portal</h2>
      <p className="mt-1 text-sm text-neutral-600">
        Usamos la misma base Supabase que Tasaciones Vedisa; un solo usuario sirve para ambas plataformas.
      </p>
      <div className="mt-6 flex flex-col gap-4">
        <label className="block text-sm font-medium text-neutral-700">
          Nombre (opcional)
          <input
            type="text"
            autoComplete="name"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-neutral-900 shadow-sm focus:border-[#33C7E3] focus:outline-none focus:ring-1 focus:ring-[#33C7E3]"
          />
        </label>
        <label className="block text-sm font-medium text-neutral-700">
          Correo
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-neutral-900 shadow-sm focus:border-[#33C7E3] focus:outline-none focus:ring-1 focus:ring-[#33C7E3]"
          />
        </label>
        <label className="block text-sm font-medium text-neutral-700">
          Contraseña (mín. 6 caracteres)
          <input
            type="password"
            autoComplete="new-password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-neutral-900 shadow-sm focus:border-[#33C7E3] focus:outline-none focus:ring-1 focus:ring-[#33C7E3]"
          />
        </label>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-[#1a2c4e] px-4 py-3 text-sm font-bold text-white hover:bg-[#243a62] disabled:opacity-60"
        >
          {loading ? "Enviando…" : "Registrarme"}
        </button>
        <p className="text-sm text-neutral-600">
          ¿Ya tienes cuenta?{" "}
          <Link href="/ingreso" className="font-semibold text-[#009ade] hover:underline">
            Inicia sesión
          </Link>
        </p>
      </div>
    </form>
  );
}
