"use client";

import { useCallback, useEffect, useState } from "react";

import type { ListaUsuarioRow } from "@/lib/portal-types";
import { ADMIN_CREATABLE_ROLES, formatRoleLabel } from "@/lib/role-labels";
import { SupabaseDeployWarning } from "@/components/supabase-deploy-warning";
import { createClient } from "@/lib/supabase/client";
import { getPublicSupabaseEnv, isSupabaseConfigured } from "@/lib/supabase/public-env";

function friendlyCreateError(raw: string): string {
  const s = raw.toLowerCase();
  if (s.includes("fetch") || s.includes("failed")) return "No se pudo contactar el servicio. Reintentá en unos minutos.";
  if (s.includes("session") || s.includes("sesión")) return raw;
  if (s.includes("already registered") || s.includes("duplicate") || s.includes("already been registered"))
    return "Ese correo ya tiene una cuenta.";
  if (s.includes("invalid") && s.includes("email")) return "Correo no válido.";
  return raw.replace(/\bsupabase\b/gi, "").trim() || "No se pudo completar la acción.";
}

export function UsuariosPanel() {
  const [users, setUsers] = useState<ListaUsuarioRow[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [pwModal, setPwModal] = useState<{ userId: string; email: string } | null>(null);

  const load = useCallback(async () => {
    setLoadErr(null);
    const supabase = createClient();
    if (!supabase) {
      setLoadErr("El acceso a datos no está configurado en este entorno.");
      return;
    }
    const { data, error } = await supabase.rpc("listar_usuarios");
    if (error) {
      setLoadErr("No se pudo cargar el listado. Verificá permisos o volvé a intentar.");
      return;
    }
    setUsers(((data ?? []) as ListaUsuarioRow[]) || []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function crearUsuario(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    setCreating(true);
    setLoadErr(null);
    const fd = new FormData(ev.currentTarget);
    const email = String(fd.get("email") ?? "").trim();
    const password = String(fd.get("password") ?? "");
    const nombre = String(fd.get("nombre") ?? "").trim();
    const rol = String(fd.get("rol") ?? "cliente_remate").trim() || "cliente_remate";
    try {
      const supabase = createClient();
      if (!supabase) throw new Error("Servicio no disponible");
      const pub = getPublicSupabaseEnv();
      if (!pub) throw new Error("Faltan variables de entorno del servidor");
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Sesión caducada. Volvé a iniciar sesión.");

      const res = await fetch(`${pub.url}/functions/v1/create-user`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
          apikey: pub.key,
        },
        body: JSON.stringify({
          email,
          password,
          nombre: nombre || undefined,
          rol,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok || json.error) {
        throw new Error(friendlyCreateError(json.error || "No se pudo crear el usuario"));
      }
      ev.currentTarget.reset();
      setCreateOpen(false);
      await load();
    } catch (e: unknown) {
      setLoadErr(friendlyCreateError(e instanceof Error ? e.message : "Error"));
    } finally {
      setCreating(false);
    }
  }

  async function actualizarPass(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    if (!pwModal) return;
    const fd = new FormData(ev.currentTarget);
    const password = String(fd.get("password") ?? "");
    try {
      const supabase = createClient();
      if (!supabase) throw new Error("Servicio no disponible");
      const pub = getPublicSupabaseEnv();
      if (!pub) throw new Error("Faltan variables de entorno del servidor");
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Sesión caducada");

      const res = await fetch(`${pub.url}/functions/v1/update-user-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
          apikey: pub.key,
        },
        body: JSON.stringify({ userId: pwModal.userId, password }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok || json.error) throw new Error(friendlyCreateError(json.error || "Error al actualizar"));
      setPwModal(null);
    } catch (e: unknown) {
      setLoadErr(friendlyCreateError(e instanceof Error ? e.message : "Error"));
    }
  }

  const missingDeploy = !isSupabaseConfigured();

  if (missingDeploy) {
    return (
      <div className="max-w-xl">
        <SupabaseDeployWarning compact />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white">Usuarios</h1>
          <p className="mt-1 text-sm text-neutral-400">Altas, roles y restablecimiento de clave.</p>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#33C7E3]/50 bg-[#33C7E3]/10 text-2xl font-light leading-none text-[#33C7E3] transition hover:bg-[#33C7E3]/20 hover:brightness-110"
          aria-label="Agregar usuario"
          title="Agregar usuario"
        >
          +
        </button>
      </div>

      {loadErr ? <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">{loadErr}</p> : null}

      <section className="rounded-xl border border-white/10 bg-[#141c28]">
        <div className="border-b border-white/10 px-5 py-3">
          <h2 className="font-semibold text-white">Lista de usuarios</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[640px] w-full border-collapse text-left text-sm">
            <thead className="text-neutral-500">
              <tr>
                <th className="px-4 py-2 font-medium">Email</th>
                <th className="px-4 py-2 font-medium">Nombre</th>
                <th className="px-4 py-2 font-medium">Rol</th>
                <th className="px-4 py-2 font-medium">Alta</th>
                <th className="px-4 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t border-white/10 text-neutral-200">
                  <td className="px-4 py-2">{u.email}</td>
                  <td className="px-4 py-2">{u.nombre}</td>
                  <td className="px-4 py-2">
                    <span className="rounded bg-white/10 px-2 py-0.5 text-xs">{formatRoleLabel(u.rol)}</span>
                  </td>
                  <td className="px-4 py-2 text-neutral-500">{u.created_at ? new Date(u.created_at).toLocaleDateString("es-CL") : "—"}</td>
                  <td className="px-4 py-2 text-right">
                    <button
                      type="button"
                      className="text-xs font-semibold text-[#33C7E3] hover:underline"
                      onClick={() =>
                        setPwModal({
                          userId: u.id,
                          email: u.email ?? "",
                        })
                      }
                    >
                      Cambiar clave
                    </button>
                  </td>
                </tr>
              ))}
              {!users.length ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-neutral-500">
                    No hay usuarios para mostrar. Si recién configuraste el panel, puede tardar unos segundos en sincronizar.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {createOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
          <div className="w-full max-w-lg rounded-xl border border-white/15 bg-[#141c28] p-6 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-white">Nuevo usuario</h3>
                <p className="mt-1 text-sm text-neutral-400">Completá los datos y asigná el tipo de acceso.</p>
              </div>
              <button
                type="button"
                className="rounded-lg border border-white/20 px-3 py-1 text-sm text-neutral-300 hover:bg-white/5"
                onClick={() => setCreateOpen(false)}
              >
                Cerrar
              </button>
            </div>
            <form onSubmit={(e) => void crearUsuario(e)} className="mt-6 grid gap-4 sm:grid-cols-2">
              <label className="text-sm sm:col-span-2">
                <span className="block text-neutral-400">Nombre</span>
                <input
                  name="nombre"
                  className="mt-1 w-full rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-white"
                  placeholder="Visible en el perfil"
                />
              </label>
              <label className="text-sm sm:col-span-2">
                <span className="block text-neutral-400">Email</span>
                <input
                  required
                  name="email"
                  type="email"
                  className="mt-1 w-full rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-white"
                />
              </label>
              <label className="text-sm sm:col-span-2">
                <span className="block text-neutral-400">Contraseña</span>
                <input
                  required
                  name="password"
                  type="password"
                  minLength={6}
                  className="mt-1 w-full rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-white"
                />
              </label>
              <label className="text-sm sm:col-span-2">
                <span className="block text-neutral-400">Tipo de usuario</span>
                <select
                  name="rol"
                  defaultValue="cliente_remate"
                  className="mt-1 w-full rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-white"
                >
                  {ADMIN_CREATABLE_ROLES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex flex-wrap gap-3 sm:col-span-2">
                <button
                  type="button"
                  className="rounded-lg border border-white/20 px-4 py-2 text-sm text-white"
                  onClick={() => setCreateOpen(false)}
                >
                  Cancelar
                </button>
                <button
                  disabled={creating}
                  type="submit"
                  className="rounded-lg bg-[#33C7E3] px-4 py-2 text-sm font-bold text-[#0f1f2c] hover:brightness-105 disabled:opacity-50"
                >
                  {creating ? "Creando…" : "Crear usuario"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {pwModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
          <div className="w-full max-w-md rounded-xl border border-white/15 bg-[#141c28] p-6 shadow-xl">
            <h3 className="text-lg font-bold text-white">Nueva contraseña</h3>
            <p className="mt-1 text-sm text-neutral-400">{pwModal.email}</p>
            <form onSubmit={(e) => void actualizarPass(e)} className="mt-4 flex flex-col gap-4">
              <label className="text-sm">
                <span className="block text-neutral-400">Contraseña (mín. 6)</span>
                <input
                  required
                  name="password"
                  minLength={6}
                  type="password"
                  className="mt-1 w-full rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-white"
                />
              </label>
              <div className="flex gap-3">
                <button type="button" className="rounded-lg border border-white/20 px-4 py-2 text-sm text-white" onClick={() => setPwModal(null)}>
                  Cancelar
                </button>
                <button type="submit" className="rounded-lg bg-[#33C7E3] px-4 py-2 text-sm font-bold text-[#0f1f2c]">
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
