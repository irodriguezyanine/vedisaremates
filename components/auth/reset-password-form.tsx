"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { type FormEvent, useEffect, useMemo, useState } from "react";

import { PasswordInput } from "@/components/auth/password-input";
import { createClient } from "@/lib/supabase/client";

export function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const recoveryType = searchParams.get("type");
  const queryAccessToken = searchParams.get("access_token");
  const queryRefreshToken = searchParams.get("refresh_token");

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

    const getHashParams = () => {
      if (typeof window === "undefined") return new URLSearchParams();
      const raw = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash;
      return new URLSearchParams(raw);
    };

    const sleep = (ms: number) =>
      new Promise<void>((resolve) => {
        setTimeout(resolve, ms);
      });

    async function verifySession() {
      try {
        let flowError: string | null = null;
        const hashParams = getHashParams();
        const hashCode = hashParams.get("code");
        const hashTokenHash = hashParams.get("token_hash");
        const hashType = hashParams.get("type");
        const hashAccessToken = hashParams.get("access_token");
        const hashRefreshToken = hashParams.get("refresh_token");
        const effectiveCode = code ?? hashCode;
        const effectiveTokenHash = tokenHash ?? hashTokenHash;
        const effectiveRecoveryType = recoveryType ?? hashType;
        const effectiveAccessToken = queryAccessToken ?? hashAccessToken;
        const effectiveRefreshToken = queryRefreshToken ?? hashRefreshToken;

        if (effectiveCode) {
          const { error: exchangeError } = await client.auth.exchangeCodeForSession(effectiveCode);
          if (exchangeError) {
            flowError = "El enlace de recuperación es inválido o ya expiró.";
          }
        } else if (effectiveAccessToken && effectiveRefreshToken) {
          const { error: setSessionError } = await client.auth.setSession({
            access_token: effectiveAccessToken,
            refresh_token: effectiveRefreshToken,
          });
          if (setSessionError) {
            flowError = "El enlace de recuperación es inválido o ya expiró.";
          }
        } else if (effectiveTokenHash && effectiveRecoveryType === "recovery") {
          const { error: otpError } = await client.auth.verifyOtp({
            token_hash: effectiveTokenHash,
            type: "recovery",
          });
          if (otpError) {
            flowError = "El enlace de recuperación es inválido o ya expiró.";
          }
        } else {
          if (hashAccessToken && hashRefreshToken) {
            const { error: setSessionError } = await client.auth.setSession({
              access_token: hashAccessToken,
              refresh_token: hashRefreshToken,
            });
            if (setSessionError) {
              flowError = "El enlace de recuperación es inválido o ya expiró.";
            }
          }
        }

        let sessionReady = false;
        for (let i = 0; i < 4; i += 1) {
          const {
            data: { session },
          } = await client.auth.getSession();
          if (session) {
            sessionReady = true;
            break;
          }
          if (i < 3) await sleep(250);
        }

        if (!cancelled) {
          setReady(sessionReady);
          if (!sessionReady && flowError) setError(flowError);
        }
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
  }, [code, tokenHash, recoveryType, queryAccessToken, queryRefreshToken, supabase]);

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
        const raw = String(updateError.message ?? "").toLowerCase();
        if (raw.includes("same") || raw.includes("different from the old") || raw.includes("diferente")) {
          setError("Tu nueva contraseña debe ser distinta a la anterior.");
        } else if (raw.includes("weak") || raw.includes("strength") || raw.includes("insegura")) {
          setError("La contraseña es demasiado débil. Usa una combinación más robusta.");
        } else if (raw.includes("session") || raw.includes("jwt") || raw.includes("token")) {
          setError("La sesión de recuperación expiró. Solicita un nuevo enlace.");
        } else {
          setError("No pudimos actualizar tu contraseña. Solicita un nuevo enlace.");
        }
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
