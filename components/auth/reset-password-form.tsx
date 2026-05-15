"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { type FormEvent, useEffect, useMemo, useState } from "react";

import { PasswordInput } from "@/components/auth/password-input";
import { createClient } from "@/lib/supabase/client";

export function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const code = searchParams.get("code");

  const supabase = useMemo(() => createClient(), []);
  const envUnavailable = !supabase;

  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(!envUnavailable);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!supabase) return;
    const client = supabase;

    async function verifySession() {
      try {
        if (code) {
          const { error: exchangeError } = await client.auth.exchangeCodeForSession(code);
          if (exchangeError && !cancelled) {
            setError("El enlace de recuperación es inválido o ya expiró.");
          }
        }

        const {
          data: { session },
        } = await client.auth.getSession();
        if (!cancelled) setReady(Boolean(session));
      } finally {
        if (!cancelled) setVerifying(false);
      }
    }

    void verifySession();

    const { data: sub } = client.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        setReady(Boolean(session));
      }
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [code, supabase]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);

    if (password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }
    if (password !== password2) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    if (!supabase) {
      setError("La recuperación de contraseña no está disponible en este entorno.");
      return;
    }

    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError("No pudimos actualizar tu contraseña. Solicita un nuevo enlace.");
        return;
      }
      setMessage("Contraseña actualizada con éxito. Te redirigimos a tu cuenta.");
      setTimeout(() => {
        router.refresh();
        router.push("/mi-cuenta");
      }, 700);
    } finally {
      setLoading(false);
    }
  }

  if (verifying) {
    return <p className="text-sm text-neutral-600">Validando enlace seguro…</p>;
  }

  if (envUnavailable) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <p>La recuperación de contraseña no está disponible en este entorno.</p>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <p>El enlace no es válido o expiró.</p>
        <p className="mt-2">Solicita uno nuevo desde “¿Se te olvidó la contraseña?”.</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
      <PasswordInput
        label="Nueva contraseña"
        autoComplete="new-password"
        required
        minLength={6}
        value={password}
        onChange={setPassword}
      />
      <PasswordInput
        label="Repetir nueva contraseña"
        autoComplete="new-password"
        required
        minLength={6}
        value={password2}
        onChange={setPassword2}
      />
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
      <button
        type="submit"
        disabled={loading}
        className="rounded-lg bg-[#1a2c4e] px-4 py-3 text-sm font-bold text-white hover:bg-[#243a62] disabled:opacity-60"
      >
        {loading ? "Actualizando…" : "Guardar nueva contraseña"}
      </button>
    </form>
  );
}
