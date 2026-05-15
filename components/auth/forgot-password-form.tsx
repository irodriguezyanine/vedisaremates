"use client";

import { type FormEvent, useState } from "react";

export function ForgotPasswordForm() {
  const [identifier, setIdentifier] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);

    if (!identifier.trim()) {
      setError("Ingresa tu correo o nombre de usuario.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/password/recover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; message?: string };
      if (!res.ok || !data?.ok) {
        if (data?.error === "demasiados_reintentos") {
          setError("Ya solicitaste muchos reenvíos. Espera unos minutos.");
          return;
        }
        setError("No pudimos procesar tu solicitud en este momento.");
        return;
      }
      setMessage(data.message ?? "Si la cuenta existe, enviamos un enlace seguro para restablecer tu contraseña.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
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
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
      <button
        type="submit"
        disabled={loading}
        className="rounded-lg bg-[#1a2c4e] px-4 py-3 text-sm font-bold text-white hover:bg-[#243a62] disabled:opacity-60"
      >
        {loading ? "Enviando enlace…" : "Enviar correo de recuperación"}
      </button>
    </form>
  );
}
