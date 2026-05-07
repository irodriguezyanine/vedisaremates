"use client";

import { useCallback, useEffect, useState } from "react";

import type { ListaUsuarioRow } from "@/lib/portal-types";
import { createClient } from "@/lib/supabase/client";

function supabaseUrl() {
  const u = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!u) throw new Error("NEXT_PUBLIC_SUPABASE_URL no configurada");
  return u;
}

function anonKey() {
  const k = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!k) throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY no configurada");
  return k;
}

export function UsuariosPanel() {
  const [users, setUsers] = useState<ListaUsuarioRow[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [pwModal, setPwModal] = useState<{ userId: string; email: string } | null>(null);

  const load = useCallback(async () => {
    setLoadErr(null);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("listar_usuarios");
    if (error) {
      setLoadErr(error.message);
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
    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Sesión caducada. Volvé a iniciar sesión.");

      const res = await fetch(`${supabaseUrl()}/functions/v1/create-user`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
          apikey: anonKey(),
        },
        body: JSON.stringify({
          email,
          password,
          nombre: nombre || undefined,
          rol: "usuario",
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok || json.error) {
        throw new Error(json.error || "No se pudo crear el usuario");
      }
      ev.currentTarget.reset();
      await load();
    } catch (e: unknown) {
      setLoadErr(e instanceof Error ? e.message : "Error");
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
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Sesión caducada");

      const res = await fetch(`${supabaseUrl()}/functions/v1/update-user-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
          apikey: anonKey(),
        },
        body: JSON.stringify({ userId: pwModal.userId, password }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok || json.error) throw new Error(json.error || "Error al actualizar");
      setPwModal(null);
    } catch (e: unknown) {
      setLoadErr(e instanceof Error ? e.message : "Error");
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold text-white">Usuarios</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Misma base que Tasaciones Vedisa (RPC{" "}
          <code className="rounded bg-white/10 px-1 text-neutral-300">listar_usuarios</code> + Edge Functions &quot;
          create-user&quot; / &quot;update-user-password&quot;).
        </p>
      </div>

      {loadErr ? <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">{loadErr}</p> : null}

      <section className="rounded-xl border border-white/10 bg-[#141c28] p-5">
        <h2 className="font-semibold text-white">Crear usuario portal / Tasaciones</h2>
        <form onSubmit={(e) => void crearUsuario(e)} className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-sm">
            <span className="block text-neutral-400">Nombre</span>
            <input
              name="nombre"
              className="mt-1 w-full rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-white"
              placeholder="Visible en perfil"
            />
          </label>
          <label className="text-sm">
            <span className="block text-neutral-400">Email</span>
            <input
              required
              name="email"
              type="email"
              className="mt-1 w-full rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-white"
            />
          </label>
          <label className="text-sm sm:col-span-2 lg:col-span-2">
            <span className="block text-neutral-400">Contraseña</span>
            <input
              required
              name="password"
              type="password"
              minLength={6}
              className="mt-1 w-full rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-white"
            />
          </label>
          <div className="flex items-end sm:col-span-2 lg:col-span-4">
            <button
              disabled={creating}
              type="submit"
              className="rounded-lg bg-[#33C7E3] px-4 py-2 text-sm font-bold text-[#0f1f2c] hover:brightness-105 disabled:opacity-50"
            >
              {creating ? "Creando…" : "Crear usuario"}
            </button>
          </div>
        </form>
      </section>

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
                    <span className="rounded bg-white/10 px-2 py-0.5 text-xs capitalize">{u.rol ?? "usuario"}</span>
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
                    No hay filas devueltas. Si sos admin, ejecutá RPC en Supabase o revisá errores arriba.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

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
