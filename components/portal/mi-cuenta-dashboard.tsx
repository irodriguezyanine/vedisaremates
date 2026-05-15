"use client";

import Link from "next/link";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";

import type { PortalMisOfertaRow } from "@/lib/portal-types";
import { formatClp } from "@/lib/format-clp";
import { uploadImageToCloudinary } from "@/lib/cloudinary-upload";
import { createClient } from "@/lib/supabase/client";

const REMATE_ESTADO: Record<string, string> = {
  borrador: "Borrador",
  publicado: "Publicado",
  en_curso: "En curso",
  cerrado: "Cerrado",
};

function formatRemateEstado(s: string) {
  return REMATE_ESTADO[s] ?? s.replace(/_/g, " ");
}

function cleanRut(input: string): string {
  return input.replace(/\./g, "").replace(/-/g, "").toUpperCase().trim();
}

function formatRut(input: string): string {
  const cleaned = cleanRut(input);
  if (cleaned.length <= 1) return cleaned;
  const body = cleaned.slice(0, -1);
  const dv = cleaned.slice(-1);
  const bodyWithDots = body.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${bodyWithDots}-${dv}`;
}

function isValidRut(input: string): boolean {
  const cleaned = cleanRut(input);
  if (!/^\d{7,8}[0-9K]$/.test(cleaned)) return false;
  const body = cleaned.slice(0, -1);
  const dv = cleaned.slice(-1);
  let sum = 0;
  let mul = 2;
  for (let i = body.length - 1; i >= 0; i -= 1) {
    sum += Number(body[i]) * mul;
    mul = mul === 7 ? 2 : mul + 1;
  }
  const mod = 11 - (sum % 11);
  const expected = mod === 11 ? "0" : mod === 10 ? "K" : String(mod);
  return dv === expected;
}

function passwordStrengthLabel(password: string): { label: string; color: string; width: string } {
  if (!password) return { label: "Sin definir", color: "bg-neutral-300", width: "w-0" };
  let score = 0;
  if (password.length >= 8) score += 1;
  if (/[A-Z]/.test(password)) score += 1;
  if (/[a-z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  if (score <= 2) return { label: "Baja", color: "bg-rose-500", width: "w-1/4" };
  if (score === 3) return { label: "Media", color: "bg-amber-500", width: "w-2/4" };
  if (score === 4) return { label: "Buena", color: "bg-sky-500", width: "w-3/4" };
  return { label: "Alta", color: "bg-emerald-500", width: "w-full" };
}

type ToastState = {
  type: "success" | "error";
  text: string;
} | null;

type Props = {
  email: string;
  initialNombre: string | null;
  initialApellido: string | null;
  initialRut: string | null;
  initialDireccion: string | null;
  initialTelefono: string | null;
  initialAvatarUrl: string | null;
  initialRol: string | null;
  mustChangePassword: boolean;
};

export function MiCuentaDashboard({
  email,
  initialNombre,
  initialApellido,
  initialRut,
  initialDireccion,
  initialTelefono,
  initialAvatarUrl,
  initialRol,
  mustChangePassword,
}: Props) {
  const [nombre, setNombre] = useState(initialNombre ?? "");
  const [apellido, setApellido] = useState(initialApellido ?? "");
  const [rut, setRut] = useState(initialRut ?? "");
  const [direccion, setDireccion] = useState(initialDireccion ?? "");
  const [telefono, setTelefono] = useState(initialTelefono ?? "");
  const [savingPerfil, setSavingPerfil] = useState(false);
  const [perfilMsg, setPerfilMsg] = useState<string | null>(null);
  const [accountEmail, setAccountEmail] = useState(email);
  const [accountPw1, setAccountPw1] = useState("");
  const [accountPw2, setAccountPw2] = useState("");
  const [savingSeguridad, setSavingSeguridad] = useState(false);
  const [seguridadMsg, setSeguridadMsg] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl ?? "");
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [ofertas, setOfertas] = useState<PortalMisOfertaRow[] | null>(null);
  const [ofertasErr, setOfertasErr] = useState<string | null>(null);
  const [forcePwOpen, setForcePwOpen] = useState(mustChangePassword);
  const [firstLoginPw1, setFirstLoginPw1] = useState("");
  const [firstLoginPw2, setFirstLoginPw2] = useState("");
  const [pwMsg, setPwMsg] = useState<string | null>(null);
  const [savingPw, setSavingPw] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const avatarMenuRef = useRef<HTMLDivElement | null>(null);

  const isClienteRemate = ["cliente_remate", "cliente-remate", "cliente remate"].includes((initialRol ?? "").toLowerCase());
  const rutIsValid = rut.trim().length === 0 ? true : isValidRut(rut);
  const mainPasswordStrength = passwordStrengthLabel(accountPw1);
  const firstLoginPasswordStrength = passwordStrengthLabel(firstLoginPw1);
  const avatarSource = `${nombre} ${apellido}`.trim() || email;
  const avatarInitials = avatarSource
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");

  async function guardarFotoPerfil(url: string) {
    const sb = createClient();
    if (!sb) {
      setToast({ type: "error", text: "Servicio temporalmente no disponible." });
      return;
    }
    const { data, error } = await sb.rpc("portal_update_mi_foto", { p_avatar_url: url });
    const res = data as { ok?: boolean; error?: string } | null;
    if (error || res?.ok === false) {
      setToast({ type: "error", text: "No se pudo guardar la foto de perfil." });
      return;
    }
    setToast({ type: "success", text: url ? "Foto de perfil actualizada." : "Foto de perfil eliminada." });
  }

  async function onSelectAvatar(file: File | null) {
    if (!file || uploadingAvatar) return;
    setUploadingAvatar(true);
    const up = await uploadImageToCloudinary(file, { folder: "vedisa/profile-photos" });
    if ("error" in up) {
      setToast({ type: "error", text: up.error });
      setUploadingAvatar(false);
      return;
    }
    setAvatarUrl(up.secureUrl);
    await guardarFotoPerfil(up.secureUrl);
    setUploadingAvatar(false);
  }

  useEffect(() => {
    if (!avatarMenuOpen) return;
    function onClickOutside(ev: MouseEvent) {
      const target = ev.target as Node | null;
      if (!target) return;
      if (avatarMenuRef.current?.contains(target)) return;
      setAvatarMenuOpen(false);
    }
    window.addEventListener("mousedown", onClickOutside);
    return () => window.removeEventListener("mousedown", onClickOutside);
  }, [avatarMenuOpen]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 3600);
    return () => window.clearTimeout(id);
  }, [toast]);

  const cargarOfertas = useCallback(async () => {
    setOfertasErr(null);
    const sb = createClient();
    if (!sb) {
      setOfertasErr("Servicio temporalmente no disponible.");
      return;
    }
    const { data, error } = await sb.rpc("portal_listar_mis_ofertas");
    if (error) {
      setOfertas([]);
      setOfertasErr(
        "Las ofertas aparecerán en esta lista después de una actualización del sistema por parte del equipo Vedisa.",
      );
      return;
    }
    setOfertas(((data ?? []) as PortalMisOfertaRow[]) || []);
    setOfertasErr(null);
  }, []);

  useEffect(() => {
    void cargarOfertas();
  }, [cargarOfertas]);

  async function guardarPerfil(ev: FormEvent) {
    ev.preventDefault();
    setSavingPerfil(true);
    setPerfilMsg(null);
    const sb = createClient();
    if (!sb) {
      setPerfilMsg("Servicio temporalmente no disponible.");
      setToast({ type: "error", text: "Servicio temporalmente no disponible." });
      setSavingPerfil(false);
      return;
    }
    if (!rutIsValid) {
      setPerfilMsg("El RUT ingresado no es válido.");
      setToast({ type: "error", text: "Revisa el formato/validez del RUT." });
      setSavingPerfil(false);
      return;
    }
    const { data, error } = await sb.rpc("portal_update_mi_perfil", {
      p_nombre: nombre.trim(),
      p_apellido: apellido.trim(),
      p_rut: rut.trim(),
      p_direccion: direccion.trim(),
      p_telefono: telefono.trim(),
    });
    const res = data as { ok?: boolean; error?: string } | null;
    if (error || res?.ok === false) {
      setPerfilMsg("No pudimos guardar tus datos por ahora. Contactá soporte Vedisa.");
      setToast({ type: "error", text: "No pudimos guardar tu perfil." });
      setSavingPerfil(false);
      return;
    }
    setPerfilMsg("Perfil actualizado.");
    setToast({ type: "success", text: "Perfil actualizado correctamente." });
    setSavingPerfil(false);
  }

  async function guardarSeguridad(ev: FormEvent) {
    ev.preventDefault();
    setSeguridadMsg(null);
    const sb = createClient();
    if (!sb) {
      setSeguridadMsg("Servicio temporalmente no disponible.");
      setToast({ type: "error", text: "Servicio temporalmente no disponible." });
      return;
    }

    const emailChanged = accountEmail.trim().toLowerCase() !== email.trim().toLowerCase();
    const passFilled = accountPw1.length > 0 || accountPw2.length > 0;

    if (!emailChanged && !passFilled) {
      setSeguridadMsg("No hay cambios para guardar.");
      setToast({ type: "error", text: "No hay cambios en seguridad para guardar." });
      return;
    }

    if (passFilled) {
      if (accountPw1.length < 6) {
        setSeguridadMsg("La nueva contraseña debe tener al menos 6 caracteres.");
        setToast({ type: "error", text: "La nueva contraseña es muy corta." });
        return;
      }
      if (accountPw1 !== accountPw2) {
        setSeguridadMsg("Las contraseñas no coinciden.");
        setToast({ type: "error", text: "Las contraseñas no coinciden." });
        return;
      }
    }

    setSavingSeguridad(true);
    if (emailChanged) {
      const { error: emailError } = await sb.auth.updateUser({ email: accountEmail.trim().toLowerCase() });
      if (emailError) {
        setSeguridadMsg("No se pudo actualizar el correo. Revisa si ya existe o inténtalo más tarde.");
        setToast({ type: "error", text: "No se pudo actualizar el correo." });
        setSavingSeguridad(false);
        return;
      }
    }
    if (passFilled) {
      const { error: passError } = await sb.auth.updateUser({ password: accountPw1 });
      if (passError) {
        setSeguridadMsg("No se pudo actualizar la contraseña.");
        setToast({ type: "error", text: "No se pudo actualizar la contraseña." });
        setSavingSeguridad(false);
        return;
      }
      const { error: flagErr } = await sb.rpc("portal_mi_cuenta_marcar_clave_actualizada");
      if (flagErr) {
        setSeguridadMsg("La contraseña cambió, pero no pudimos cerrar la bandera de primer acceso.");
        setToast({ type: "error", text: "Contraseña cambiada, pero hubo un error de sincronización." });
        setSavingSeguridad(false);
        return;
      }
      setForcePwOpen(false);
    }
    setAccountPw1("");
    setAccountPw2("");
    setSeguridadMsg(emailChanged ? "Seguridad actualizada. Revisa tu correo para confirmar el cambio de email." : "Contraseña actualizada.");
    setToast({
      type: "success",
      text: emailChanged
        ? "Seguridad actualizada. Revisa tu correo para confirmar el nuevo email."
        : "Contraseña actualizada correctamente.",
    });
    setSavingSeguridad(false);
  }

  async function guardarClavePrimerIngreso(ev: FormEvent) {
    ev.preventDefault();
    setPwMsg(null);
    if (firstLoginPw1.length < 6) {
      setPwMsg("La contraseña debe tener al menos 6 caracteres.");
      setToast({ type: "error", text: "La contraseña debe tener al menos 6 caracteres." });
      return;
    }
    if (firstLoginPw1 !== firstLoginPw2) {
      setPwMsg("Las contraseñas no coinciden.");
      setToast({ type: "error", text: "Las contraseñas no coinciden." });
      return;
    }
    setSavingPw(true);
    const sb = createClient();
    if (!sb) {
      setPwMsg("Servicio temporalmente no disponible.");
      setToast({ type: "error", text: "Servicio temporalmente no disponible." });
      setSavingPw(false);
      return;
    }
    const { error } = await sb.auth.updateUser({ password: firstLoginPw1 });
    if (error) {
      setPwMsg("No pudimos actualizar la contraseña. Intenta nuevamente.");
      setToast({ type: "error", text: "No pudimos actualizar la contraseña." });
      setSavingPw(false);
      return;
    }
    const { error: flagErr } = await sb.rpc("portal_mi_cuenta_marcar_clave_actualizada");
    if (flagErr) {
      setPwMsg("La contraseña se actualizó, pero no pudimos cerrar la alerta. Recarga la página.");
      setToast({ type: "error", text: "Contraseña cambiada, pero hubo un error al cerrar la alerta." });
      setSavingPw(false);
      return;
    }
    setForcePwOpen(false);
    setPwMsg(null);
    setToast({ type: "success", text: "Contraseña actualizada. Ya puedes usar tu cuenta normalmente." });
    setSavingPw(false);
  }

  function renderResultado(resultado: PortalMisOfertaRow["resultado"]) {
    if (resultado === "ganado") {
      return <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">Ganado</span>;
    }
    if (resultado === "no_ganado") {
      return <span className="rounded-full bg-rose-100 px-2.5 py-1 text-xs font-semibold text-rose-700">No ganado</span>;
    }
    return <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">Pendiente</span>;
  }

  function scrollToSection(sectionId: string) {
    const el = document.getElementById(sectionId);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="min-h-[60vh] bg-gradient-to-b from-[#f0f9fc] via-white to-white">
      <div className="mx-auto max-w-5xl px-4 py-10 sm:py-14">
        <Link href="/" className="text-sm font-semibold text-[#009ade] hover:underline">
          ← Inicio
        </Link>

        <section
          className={`mt-6 relative overflow-hidden rounded-3xl border p-6 sm:p-7 shadow-sm ${
            isClienteRemate
              ? "border-[#33C7E3]/35 bg-gradient-to-br from-[#1a2c4e] via-[#1e3a52] to-[#0f1f2c] text-white"
              : "border-neutral-200 bg-white text-neutral-900"
          }`}
        >
          {isClienteRemate ? (
            <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-[#33C7E3]/20 blur-3xl" aria-hidden />
          ) : null}
          <div className="relative flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className={`text-xs font-bold uppercase tracking-[0.2em] ${isClienteRemate ? "text-[#33C7E3]" : "text-[#009ade]"}`}>
                Tu espacio
              </p>
              <h1 className={`mt-2 text-3xl font-black ${isClienteRemate ? "text-white" : "text-neutral-900"}`}>
                {isClienteRemate ? "Cliente remate" : "Mi cuenta"}
              </h1>
              <p className={`mt-3 max-w-2xl text-sm leading-relaxed ${isClienteRemate ? "text-white/80" : "text-neutral-600"}`}>
                {isClienteRemate
                  ? "Gestiona tus datos completos, seguridad de acceso y seguimiento de ofertas en un solo lugar."
                  : "Administra tus datos de cuenta, seguridad y actividad de remates."}
              </p>
              {!isClienteRemate && ["admin", "sac"].includes((initialRol ?? "").toLowerCase()) ? (
                <div className="mt-6">
                  <Link
                    href="/admin"
                    className="inline-flex items-center justify-center rounded-xl border border-neutral-300 px-5 py-3 text-sm font-bold text-neutral-900 hover:bg-neutral-50"
                  >
                    Panel administración
                  </Link>
                </div>
              ) : null}
            </div>
            <div className="relative shrink-0" ref={avatarMenuRef}>
              <button
                type="button"
                onClick={() => setAvatarMenuOpen((v) => !v)}
                className={`relative inline-flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border text-base font-black ${
                  isClienteRemate
                    ? "border-white/30 bg-white/10 text-white hover:bg-white/20"
                    : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50"
                }`}
                title="Opciones de foto de perfil"
              >
                {avatarUrl ? (
                  <Image src={avatarUrl} alt="Foto de perfil" fill sizes="64px" className="object-cover" />
                ) : (
                  avatarInitials || "VR"
                )}
              </button>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => void onSelectAvatar(e.target.files?.[0] ?? null)}
              />
              {avatarMenuOpen ? (
                <div
                  className={`absolute right-0 z-20 mt-2 w-52 rounded-xl border shadow-lg ${
                    isClienteRemate
                      ? "border-white/20 bg-[#0f1f2c] text-white"
                      : "border-neutral-200 bg-white text-neutral-900"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      avatarInputRef.current?.click();
                      setAvatarMenuOpen(false);
                    }}
                    className={`block w-full px-3 py-2 text-left text-sm ${
                      isClienteRemate ? "hover:bg-white/10" : "hover:bg-neutral-50"
                    }`}
                  >
                    {uploadingAvatar ? "Subiendo..." : avatarUrl ? "Cambiar foto" : "Subir foto"}
                  </button>
                  {avatarUrl ? (
                    <button
                      type="button"
                      onClick={() => {
                        setAvatarUrl("");
                        void guardarFotoPerfil("");
                        setAvatarMenuOpen(false);
                      }}
                      className={`block w-full px-3 py-2 text-left text-sm ${
                        isClienteRemate ? "text-rose-200 hover:bg-white/10" : "text-rose-600 hover:bg-neutral-50"
                      }`}
                    >
                      Eliminar foto
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </section>

        <div className="mt-6 grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
          <aside className="rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm lg:sticky lg:top-20 lg:h-fit">
            <p className="px-2 text-xs font-bold uppercase tracking-[0.18em] text-[#009ade]">Tu espacio</p>
            <div className="mt-3 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => scrollToSection("mi-cuenta-tu-espacio")}
                className="rounded-xl border border-neutral-200 px-3 py-2 text-left text-sm font-semibold text-neutral-700 hover:border-[#33C7E3] hover:text-[#1a2c4e]"
              >
                Datos personales
              </button>
              <button
                type="button"
                onClick={() => scrollToSection("mi-cuenta-seguridad")}
                className="rounded-xl border border-neutral-200 px-3 py-2 text-left text-sm font-semibold text-neutral-700 hover:border-[#33C7E3] hover:text-[#1a2c4e]"
              >
                Seguridad y acceso
              </button>
              <button
                type="button"
                onClick={() => scrollToSection("mi-cuenta-historial")}
                className="rounded-xl border border-neutral-200 px-3 py-2 text-left text-sm font-semibold text-neutral-700 hover:border-[#33C7E3] hover:text-[#1a2c4e]"
              >
                Historial de ofertas
              </button>
            </div>
          </aside>

          <div className="space-y-6">
            <section id="mi-cuenta-tu-espacio" className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-bold text-neutral-900">Tu espacio</h2>
              <p className="mt-1 text-sm text-neutral-600">Actualiza tu perfil completo para operar con información vigente.</p>
              <form onSubmit={(e) => void guardarPerfil(e)} className="mt-5 grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-medium text-neutral-800">
                  Nombre
                  <input
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    className="mt-2 w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-neutral-900 shadow-sm focus:border-[#33C7E3] focus:outline-none focus:ring-2 focus:ring-[#33C7E3]/25"
                    placeholder="Nombre"
                  />
                </label>
                <label className="block text-sm font-medium text-neutral-800">
                  Apellido
                  <input
                    value={apellido}
                    onChange={(e) => setApellido(e.target.value)}
                    className="mt-2 w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-neutral-900 shadow-sm focus:border-[#33C7E3] focus:outline-none focus:ring-2 focus:ring-[#33C7E3]/25"
                    placeholder="Apellido"
                  />
                </label>
                <label className="block text-sm font-medium text-neutral-800">
                  RUT
                  <input
                    value={rut}
                    onChange={(e) => setRut(formatRut(e.target.value))}
                    className="mt-2 w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-neutral-900 shadow-sm focus:border-[#33C7E3] focus:outline-none focus:ring-2 focus:ring-[#33C7E3]/25"
                    placeholder="12.345.678-9"
                  />
                  {!rutIsValid ? <span className="mt-1 block text-xs text-rose-600">RUT inválido.</span> : null}
                </label>
                <label className="block text-sm font-medium text-neutral-800">
                  Teléfono
                  <input
                    value={telefono}
                    onChange={(e) => setTelefono(e.target.value)}
                    className="mt-2 w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-neutral-900 shadow-sm focus:border-[#33C7E3] focus:outline-none focus:ring-2 focus:ring-[#33C7E3]/25"
                    placeholder="+56 9 ..."
                  />
                </label>
                <label className="block text-sm font-medium text-neutral-800 sm:col-span-2">
                  Dirección
                  <input
                    value={direccion}
                    onChange={(e) => setDireccion(e.target.value)}
                    className="mt-2 w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-neutral-900 shadow-sm focus:border-[#33C7E3] focus:outline-none focus:ring-2 focus:ring-[#33C7E3]/25"
                    placeholder="Dirección completa"
                  />
                </label>
                <button
                  type="submit"
                  disabled={savingPerfil}
                  className="sm:col-span-2 w-full rounded-xl bg-[#1a2c4e] py-3 text-sm font-bold text-white transition hover:bg-[#243a62] disabled:opacity-60"
                >
                  {savingPerfil ? "Guardando..." : "Guardar datos personales"}
                </button>
                {perfilMsg ? <p className="sm:col-span-2 text-sm text-emerald-700">{perfilMsg}</p> : null}
              </form>
            </section>

            <section id="mi-cuenta-seguridad" className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-bold text-neutral-900">Seguridad y acceso</h2>
              <p className="mt-1 text-sm text-neutral-600">Edita correo de acceso y define una nueva contraseña segura.</p>
              <form onSubmit={(e) => void guardarSeguridad(e)} className="mt-5 space-y-4">
                <label className="block text-sm font-medium text-neutral-800">
                  Correo
                  <input
                    type="email"
                    value={accountEmail}
                    onChange={(e) => setAccountEmail(e.target.value)}
                    className="mt-2 w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-neutral-900 shadow-sm focus:border-[#33C7E3] focus:outline-none focus:ring-2 focus:ring-[#33C7E3]/25"
                  />
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm font-medium text-neutral-800">
                    Nueva contraseña
                    <input
                      type="password"
                      minLength={6}
                      value={accountPw1}
                      onChange={(e) => setAccountPw1(e.target.value)}
                      className="mt-2 w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-neutral-900 shadow-sm focus:border-[#33C7E3] focus:outline-none focus:ring-2 focus:ring-[#33C7E3]/25"
                      placeholder="Mínimo 6 caracteres"
                    />
                    <div className="mt-2">
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-200">
                        <div className={`h-full ${mainPasswordStrength.color} ${mainPasswordStrength.width}`} />
                      </div>
                      <p className="mt-1 text-xs text-neutral-500">Fortaleza: {mainPasswordStrength.label}</p>
                    </div>
                  </label>
                  <label className="block text-sm font-medium text-neutral-800">
                    Repetir contraseña
                    <input
                      type="password"
                      minLength={6}
                      value={accountPw2}
                      onChange={(e) => setAccountPw2(e.target.value)}
                      className="mt-2 w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-neutral-900 shadow-sm focus:border-[#33C7E3] focus:outline-none focus:ring-2 focus:ring-[#33C7E3]/25"
                      placeholder="Repite la contraseña"
                    />
                  </label>
                </div>
                <button
                  type="submit"
                  disabled={savingSeguridad}
                  className="w-full rounded-xl bg-[#0f1f2c] py-3 text-sm font-bold text-white transition hover:bg-[#1a2c4e] disabled:opacity-60"
                >
                  {savingSeguridad ? "Guardando..." : "Guardar seguridad"}
                </button>
                {seguridadMsg ? <p className="text-sm text-emerald-700">{seguridadMsg}</p> : null}
              </form>
            </section>
          </div>
        </div>

        <section id="mi-cuenta-historial" className="mt-10 rounded-3xl border border-neutral-200 bg-white shadow-sm">
          <div className="border-b border-neutral-100 px-6 py-5 sm:px-8">
            <h2 className="text-xl font-bold text-neutral-900">Ofertas realizadas</h2>
            <p className="mt-1 text-sm text-neutral-600">
              Historial ordenado desde la última vez que apostó por un lote. Puede entrar nuevamente al remate desde la tabla.
            </p>
          </div>
          {ofertasErr ? <p className="px-6 py-8 text-center text-sm text-amber-800 sm:px-8">{ofertasErr}</p> : null}
          {!ofertasErr && ofertas && ofertas.length === 0 ? (
            <div className="px-6 py-16 text-center sm:px-8">
              <p className="text-neutral-700">Todavía no registramos ofertas con esta cuenta.</p>
              <Link href="/subastas" className="mt-4 inline-block font-bold text-[#009ade] hover:underline">
                Explorar remates disponibles →
              </Link>
            </div>
          ) : null}
          {ofertas && ofertas.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-[720px] w-full border-collapse text-left text-sm">
                <thead className="bg-neutral-50 text-xs font-bold uppercase tracking-wider text-neutral-500">
                  <tr>
                    <th className="px-6 py-3 sm:px-8">Fecha</th>
                    <th className="px-4 py-3">Remate</th>
                    <th className="px-4 py-3">Lote</th>
                    <th className="px-4 py-3">Estado</th>
                    <th className="px-4 py-3 text-right">Monto</th>
                    <th className="px-4 py-3">Resultado</th>
                    <th className="px-6 py-3 sm:px-8" />
                  </tr>
                </thead>
                <tbody>
                  {ofertas.map((o) => (
                    <tr key={o.oferta_id} className="border-t border-neutral-100 text-neutral-800">
                      <td className="whitespace-nowrap px-6 py-4 text-neutral-600 sm:px-8">
                        {new Date(o.created_at).toLocaleString("es-CL")}
                      </td>
                      <td className="max-w-[200px] px-4 py-4 font-medium">{o.remate_titulo}</td>
                      <td className="max-w-[180px] px-4 py-4 text-neutral-600">{o.lote_titulo}</td>
                      <td className="px-4 py-4">
                        <span className="rounded-full bg-[#eef6ff] px-2.5 py-1 text-xs font-semibold text-[#1a2c4e]">
                          {formatRemateEstado(o.remate_estado)}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-right font-bold tabular-nums text-neutral-900">{formatClp(o.monto)}</td>
                      <td className="px-4 py-4">{renderResultado(o.resultado)}</td>
                      <td className="px-6 py-4 sm:px-8">
                        <Link href={`/subastas/${o.remate_id}`} className="text-xs font-bold text-[#009ade] hover:underline">
                          Ver sala →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      </div>
      {forcePwOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-white/15 bg-[#141c28] p-6 shadow-xl">
            <h2 className="text-lg font-bold text-white">Actualiza tu contraseña</h2>
            <p className="mt-2 text-sm text-neutral-300">
              Por seguridad, en tu primer ingreso debes cambiar la contraseña inicial para seguir usando tu cuenta.
            </p>
            <form onSubmit={(e) => void guardarClavePrimerIngreso(e)} className="mt-4 space-y-4">
              <label className="block text-sm text-neutral-200">
                Nueva contraseña
                <input
                  required
                  minLength={6}
                  type="password"
                  value={firstLoginPw1}
                  onChange={(e) => setFirstLoginPw1(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-white"
                />
                <div className="mt-2">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                    <div className={`h-full ${firstLoginPasswordStrength.color} ${firstLoginPasswordStrength.width}`} />
                  </div>
                  <p className="mt-1 text-xs text-neutral-300">Fortaleza: {firstLoginPasswordStrength.label}</p>
                </div>
              </label>
              <label className="block text-sm text-neutral-200">
                Confirmar contraseña
                <input
                  required
                  minLength={6}
                  type="password"
                  value={firstLoginPw2}
                  onChange={(e) => setFirstLoginPw2(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-white"
                />
              </label>
              {pwMsg ? <p className="text-sm text-amber-300">{pwMsg}</p> : null}
              <button
                type="submit"
                disabled={savingPw}
                className="w-full rounded-lg bg-[#33C7E3] px-4 py-2 text-sm font-bold text-[#0f1f2c] disabled:opacity-60"
              >
                {savingPw ? "Guardando..." : "Guardar nueva contraseña"}
              </button>
            </form>
          </div>
        </div>
      ) : null}
      {toast ? (
        <div className="fixed right-4 top-4 z-[60]">
          <div
            className={`min-w-[280px] max-w-[360px] rounded-xl border px-4 py-3 text-sm shadow-lg ${
              toast.type === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                : "border-rose-200 bg-rose-50 text-rose-900"
            }`}
          >
            {toast.text}
          </div>
        </div>
      ) : null}
    </div>
  );
}
