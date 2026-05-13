"use client";

import Link from "next/link";
import { useState } from "react";

import { SITE } from "@/lib/site-config";

function passwordStrength(password: string): { label: string; width: string; color: string } {
  if (!password) return { label: "Sin definir", width: "w-0", color: "bg-neutral-300" };
  if (password.length < 6) return { label: "Baja", width: "w-1/4", color: "bg-rose-500" };
  if (password.length < 9) return { label: "Media", width: "w-2/4", color: "bg-amber-500" };
  if (password.length < 12) return { label: "Buena", width: "w-3/4", color: "bg-sky-500" };
  return { label: "Alta", width: "w-full", color: "bg-emerald-500" };
}

export function RegisterForm() {
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptPrivacy, setAcceptPrivacy] = useState(false);
  const [website, setWebsite] = useState("");
  const [formStartedAt] = useState<number>(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendInfo, setResendInfo] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setResendInfo(null);
    if (password !== password2) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    if (!acceptTerms || !acceptPrivacy) {
      setError("Debes aceptar términos y política de privacidad para continuar.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre,
          email,
          password,
          website,
          formStartedAt,
          origin: typeof window !== "undefined" ? window.location.origin : "",
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; message?: string };
      if (!res.ok || !data?.ok) {
        const map: Record<string, string> = {
          email_invalido: "Correo inválido.",
          password_debil: "La contraseña debe tener al menos 6 caracteres.",
          demasiadas_solicitudes_ip: "Se alcanzó el límite de intentos. Intenta nuevamente en unos minutos.",
          demasiadas_solicitudes_email: "Se alcanzó el límite de envíos para este correo. Intenta más tarde.",
          mail_no_enviado: "No pudimos enviar el correo en este momento. Intenta nuevamente en unos minutos.",
          auth_admin_no_configurado: "Registro temporalmente no disponible. Contacta soporte Vedisa.",
        };
        setError(map[data?.error ?? ""] ?? "No se pudo completar el registro. Inténtalo nuevamente.");
        return;
      }
      setMessage(
        data.message ??
          "Te enviamos un correo de verificación con el link de activación y pasos para constituir tu garantía.",
      );
      setPassword("");
      setPassword2("");
    } finally {
      setLoading(false);
    }
  }

  async function resendVerification() {
    setError(null);
    setResendInfo(null);
    if (!email.trim()) {
      setError("Indica un correo para reenviar el enlace.");
      return;
    }
    setResending(true);
    try {
      const res = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          origin: typeof window !== "undefined" ? window.location.origin : "",
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; message?: string };
      if (!res.ok || !data?.ok) {
        if (data?.error === "demasiados_reintentos") {
          setError("Ya solicitaste muchos reenvíos. Espera unos minutos.");
          return;
        }
        setError("No pudimos reenviar el enlace en este momento.");
        return;
      }
      setResendInfo(data.message ?? "Si el correo existe, reenviamos un enlace de verificación.");
    } finally {
      setResending(false);
    }
  }

  const passStrength = passwordStrength(password);

  return (
    <form id="crear-cuenta-portal" onSubmit={onSubmit} className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-bold text-neutral-900">Crear cuenta en el portal</h2>
      <p className="mt-1 text-sm text-neutral-600">
        Puede usar la misma cuenta en los canales Vedisa que compartan este registro.
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
          <div className="mt-2">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-200">
              <div className={`h-full ${passStrength.width} ${passStrength.color}`} />
            </div>
            <p className="mt-1 text-xs text-neutral-500">Fortaleza: {passStrength.label}</p>
          </div>
        </label>
        <label className="block text-sm font-medium text-neutral-700">
          Repetir contraseña
          <input
            type="password"
            autoComplete="new-password"
            required
            minLength={6}
            value={password2}
            onChange={(e) => setPassword2(e.target.value)}
            className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-neutral-900 shadow-sm focus:border-[#33C7E3] focus:outline-none focus:ring-1 focus:ring-[#33C7E3]"
          />
        </label>
        <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-xs text-neutral-700">
          Al verificar tu correo, recuerda constituir tu garantía para habilitar participación en remates ({SITE.guaranteeAmountDisplay}).
          Puedes enviar comprobante por WhatsApp o a <strong>{SITE.pagosEmail}</strong>.
        </div>
        <label className="flex items-start gap-2 text-sm text-neutral-700">
          <input type="checkbox" checked={acceptTerms} onChange={(e) => setAcceptTerms(e.target.checked)} className="mt-0.5" />
          <span>
            Acepto los{" "}
            <Link href="/terminos" className="font-semibold text-[#009ade] hover:underline">
              términos y condiciones
            </Link>
            .
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm text-neutral-700">
          <input type="checkbox" checked={acceptPrivacy} onChange={(e) => setAcceptPrivacy(e.target.checked)} className="mt-0.5" />
          <span>
            Acepto la{" "}
            <Link href="/privacidad" className="font-semibold text-[#009ade] hover:underline">
              política de privacidad
            </Link>
            .
          </span>
        </label>
        <label className="hidden" aria-hidden>
          Website
          <input
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
        </label>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
        {message ? (
          <button
            type="button"
            onClick={() => void resendVerification()}
            disabled={resending}
            className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-60"
          >
            {resending ? "Reenviando…" : "Reenviar correo de verificación"}
          </button>
        ) : null}
        {resendInfo ? <p className="text-xs text-neutral-600">{resendInfo}</p> : null}
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
