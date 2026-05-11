"use client";

import { type ChangeEvent, type FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import type { ListaUsuarioRow } from "@/lib/portal-types";
import { ADMIN_CREATABLE_ROLES, formatRoleLabel } from "@/lib/role-labels";
import { SupabaseDeployWarning } from "@/components/supabase-deploy-warning";
import { createClient } from "@/lib/supabase/client";
import { getPublicSupabaseEnv, isSupabaseConfigured } from "@/lib/supabase/public-env";

type TabKey = "staff" | "cliente_remate";
type FilterColumn = "email" | "nombre" | "rol" | "created_at";

type ImportRow = {
  nombre: string;
  apellido: string;
  email: string;
};

const FILTER_COLUMN_LABEL: Record<FilterColumn, string> = {
  email: "Email",
  nombre: "Nombre",
  rol: "Rol",
  created_at: "Fecha alta",
};

function friendlyCreateError(raw: string): string {
  const s = raw.toLowerCase();
  if (s.includes("fetch") || s.includes("failed")) return "No se pudo contactar el servicio. Reintentá en unos minutos.";
  if (s.includes("session") || s.includes("sesión")) return raw;
  if (s.includes("already registered") || s.includes("duplicate") || s.includes("already been registered")) return "Ese correo ya tiene una cuenta.";
  if (s.includes("invalid") && s.includes("email")) return "Correo no válido.";
  return raw.replace(/\bsupabase\b/gi, "").trim() || "No se pudo completar la acción.";
}

function normalize(v: unknown): string {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function isClienteRemate(rol: string | null | undefined): boolean {
  return normalize(rol) === "cliente_remate";
}

function rowColumnValue(u: ListaUsuarioRow, col: FilterColumn): string {
  if (col === "email") return u.email ?? "";
  if (col === "nombre") return u.nombre ?? "";
  if (col === "rol") return formatRoleLabel(u.rol);
  if (!u.created_at) return "";
  return new Date(u.created_at).toLocaleDateString("es-CL");
}

function csvSafe(text: string): string {
  const value = text.replace(/"/g, '""');
  return `"${value}"`;
}

function parseCsvText(raw: string): ImportRow[] {
  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length <= 1) return [];
  const rows: ImportRow[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cols = lines[i].split(";").map((c) => c.trim());
    if (cols.length < 3) continue;
    const nombre = cols[0] ?? "";
    const apellido = cols[1] ?? "";
    const email = (cols[2] ?? "").toLowerCase();
    if (!email || !email.includes("@")) continue;
    rows.push({ nombre, apellido, email });
  }
  return rows;
}

async function markPasswordChangeRequired(email: string) {
  const sb = createClient();
  if (!sb) return;
  await sb.rpc("portal_marcar_cambio_clave_por_email", {
    p_email: email,
    p_requerido: true,
  });
}

export function UsuariosPanel() {
  const [users, setUsers] = useState<ListaUsuarioRow[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [pwModal, setPwModal] = useState<{ userId: string; email: string } | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("staff");
  const [globalSearch, setGlobalSearch] = useState("");
  const [filterColumn, setFilterColumn] = useState<FilterColumn>("email");
  const [columnSearch, setColumnSearch] = useState("");
  const [forceChangeOnCreate, setForceChangeOnCreate] = useState(true);

  const [importOpen, setImportOpen] = useState(false);
  const [importFileName, setImportFileName] = useState("");
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [importRole, setImportRole] = useState("cliente_remate");
  const [importing, setImporting] = useState(false);
  const [importPassword, setImportPassword] = useState("Vedisa");
  const [importResult, setImportResult] = useState<{
    created: number;
    failed: number;
    errors: string[];
  } | null>(null);

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

  async function crearUsuario(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    setCreating(true);
    setLoadErr(null);
    const fd = new FormData(ev.currentTarget);
    const email = String(fd.get("email") ?? "").trim().toLowerCase();
    const password = String(fd.get("password") ?? "");
    const password2 = String(fd.get("password2") ?? "");
    const nombrePart = String(fd.get("nombre") ?? "").trim();
    const apellido = String(fd.get("apellido") ?? "").trim();
    const nombreCompleto = [nombrePart, apellido].filter(Boolean).join(" ").trim();
    const rut = String(fd.get("rut") ?? "").trim();
    const telefono = String(fd.get("telefono") ?? "").trim();
    const direccion = String(fd.get("direccion") ?? "").trim();
    const empresa = String(fd.get("empresa") ?? "").trim();
    const rol = String(fd.get("rol") ?? "cliente_remate").trim() || "cliente_remate";

    if (password !== password2) {
      setLoadErr("Las contraseñas no coinciden.");
      setCreating(false);
      return;
    }

    try {
      const supabase = createClient();
      if (!supabase) throw new Error("Servicio no disponible");
      const pub = getPublicSupabaseEnv();
      if (!pub) throw new Error("Faltan variables de entorno del servidor");
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Sesión caducada. Volvé a iniciar sesión.");

      const payload: Record<string, string | boolean | undefined> = {
        email,
        password,
        rol,
        nombre: nombreCompleto || nombrePart || apellido || undefined,
        apellido: apellido || undefined,
        rut: rut || undefined,
        telefono: telefono || undefined,
        direccion: direccion || undefined,
        empresa: empresa || undefined,
      };

      Object.keys(payload).forEach((k) => {
        if (payload[k] === undefined) delete payload[k];
      });

      const res = await fetch(`${pub.url}/functions/v1/create-user`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
          apikey: pub.key,
        },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok || json.error) {
        throw new Error(friendlyCreateError(json.error || "No se pudo crear el usuario"));
      }
      if (forceChangeOnCreate) {
        await markPasswordChangeRequired(email);
      }
      ev.currentTarget.reset();
      setForceChangeOnCreate(true);
      setCreateOpen(false);
      await load();
    } catch (e: unknown) {
      setLoadErr(friendlyCreateError(e instanceof Error ? e.message : "Error"));
    } finally {
      setCreating(false);
    }
  }

  async function actualizarPass(ev: FormEvent<HTMLFormElement>) {
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
      await markPasswordChangeRequired(pwModal.email);
      setPwModal(null);
    } catch (e: unknown) {
      setLoadErr(friendlyCreateError(e instanceof Error ? e.message : "Error"));
    }
  }

  const usersByTab = useMemo(() => {
    const staff = users.filter((u) => !isClienteRemate(u.rol));
    const cliente = users.filter((u) => isClienteRemate(u.rol));
    return { staff, cliente };
  }, [users]);

  const tabRows = activeTab === "staff" ? usersByTab.staff : usersByTab.cliente;

  const filteredRows = useMemo(() => {
    const g = normalize(globalSearch);
    const c = normalize(columnSearch);
    return tabRows.filter((u) => {
      const allCols = [
        u.email ?? "",
        u.nombre ?? "",
        formatRoleLabel(u.rol),
        u.created_at ? new Date(u.created_at).toLocaleDateString("es-CL") : "",
      ]
        .join(" | ")
        .toLowerCase();
      const globalOk = !g || normalize(allCols).includes(g);
      const colValue = normalize(rowColumnValue(u, filterColumn));
      const colOk = !c || colValue.includes(c);
      return globalOk && colOk;
    });
  }, [columnSearch, filterColumn, globalSearch, tabRows]);

  function exportFilteredCsv() {
    const lines = [
      "Email;Nombre;Rol;Alta",
      ...filteredRows.map((u) =>
        [
          csvSafe(u.email ?? ""),
          csvSafe(u.nombre ?? ""),
          csvSafe(formatRoleLabel(u.rol)),
          csvSafe(u.created_at ? new Date(u.created_at).toLocaleDateString("es-CL") : ""),
        ].join(";"),
      ),
    ];
    const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `usuarios-${activeTab}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function onSelectCsvFile(ev: ChangeEvent<HTMLInputElement>) {
    const f = ev.target.files?.[0];
    if (!f) return;
    const txt = await f.text();
    const parsed = parseCsvText(txt);
    setImportFileName(f.name);
    setImportRows(parsed);
    setImportResult(null);
  }

  async function importCsvUsers() {
    if (!importRows.length || importing) return;
    setImporting(true);
    setLoadErr(null);
    setImportResult(null);
    try {
      const supabase = createClient();
      if (!supabase) throw new Error("Servicio no disponible");
      const pub = getPublicSupabaseEnv();
      if (!pub) throw new Error("Faltan variables de entorno del servidor");
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Sesión caducada. Volvé a iniciar sesión.");

      let created = 0;
      let failed = 0;
      const errors: string[] = [];

      for (let i = 0; i < importRows.length; i += 1) {
        const row = importRows[i];
        const payload = {
          email: row.email,
          password: importPassword,
          rol: importRole,
          nombre: [row.nombre, row.apellido].filter(Boolean).join(" ").trim() || row.nombre || row.apellido || undefined,
          apellido: row.apellido || undefined,
        };
        const res = await fetch(`${pub.url}/functions/v1/create-user`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
            apikey: pub.key,
          },
          body: JSON.stringify(payload),
        });
        const json = (await res.json()) as { error?: string };
        if (!res.ok || json.error) {
          failed += 1;
          errors.push(`${row.email}: ${friendlyCreateError(json.error || "Error")}`);
          continue;
        }
        await markPasswordChangeRequired(row.email);
        created += 1;
      }

      setImportResult({ created, failed, errors: errors.slice(0, 25) });
      await load();
    } catch (e: unknown) {
      setLoadErr(friendlyCreateError(e instanceof Error ? e.message : "Error"));
    } finally {
      setImporting(false);
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
          <p className="mt-1 text-sm text-neutral-400">Gestión de perfiles, importación masiva y restablecimiento de clave.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={exportFilteredCsv}
            className="rounded-lg border border-white/20 px-3 py-2 text-sm font-semibold text-neutral-200 hover:bg-white/5"
          >
            Descargar lista filtrada
          </button>
          <button
            type="button"
            onClick={() => setImportOpen(true)}
            className="rounded-lg border border-[#33C7E3]/40 px-3 py-2 text-sm font-semibold text-[#33C7E3] hover:bg-[#33C7E3]/10"
          >
            Importar CSV
          </button>
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
      </div>

      {loadErr ? <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">{loadErr}</p> : null}

      <section className="rounded-xl border border-white/10 bg-[#141c28]">
        <div className="border-b border-white/10 px-5 py-3">
          <h2 className="font-semibold text-white">Lista de usuarios</h2>
        </div>
        <div className="space-y-4 px-5 py-4">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setActiveTab("staff")}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
                activeTab === "staff" ? "bg-[#33C7E3]/20 text-[#33C7E3]" : "bg-white/5 text-neutral-300"
              }`}
            >
              Usuarios ({usersByTab.staff.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("cliente_remate")}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
                activeTab === "cliente_remate" ? "bg-[#33C7E3]/20 text-[#33C7E3]" : "bg-white/5 text-neutral-300"
              }`}
            >
              Cliente-remate ({usersByTab.cliente.length})
            </button>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <label className="text-sm md:col-span-2">
              <span className="block text-neutral-400">Buscador en cualquier columna</span>
              <input
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
                placeholder="Buscar por email, nombre, rol o fecha..."
                className="mt-1 w-full rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-white placeholder:text-neutral-600"
              />
            </label>
            <label className="text-sm">
              <span className="block text-neutral-400">Filtrar columna</span>
              <select
                value={filterColumn}
                onChange={(e) => setFilterColumn(e.target.value as FilterColumn)}
                className="mt-1 w-full rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-white"
              >
                {Object.entries(FILTER_COLUMN_LABEL).map(([k, lbl]) => (
                  <option key={k} value={k}>
                    {lbl}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm md:col-span-3">
              <span className="block text-neutral-400">Texto para columna seleccionada</span>
              <input
                value={columnSearch}
                onChange={(e) => setColumnSearch(e.target.value)}
                placeholder={`Filtrar por ${FILTER_COLUMN_LABEL[filterColumn].toLowerCase()}...`}
                className="mt-1 w-full rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-white placeholder:text-neutral-600"
              />
            </label>
          </div>
        </div>
        <div className="overflow-x-auto border-t border-white/10">
          <table className="min-w-[760px] w-full border-collapse text-left text-sm">
            <thead className="text-neutral-500">
              <tr>
                <th className="px-4 py-2 font-medium">Email</th>
                <th className="px-4 py-2 font-medium">Nombre</th>
                <th className="px-4 py-2 font-medium">Rol</th>
                <th className="px-4 py-2 font-medium">Alta</th>
                <th className="px-4 py-2 font-medium">Clave inicial</th>
                <th className="px-4 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((u) => (
                <tr key={u.id} className="border-t border-white/10 text-neutral-200">
                  <td className="px-4 py-2">{u.email}</td>
                  <td className="px-4 py-2">{u.nombre}</td>
                  <td className="px-4 py-2">
                    <span className="rounded bg-white/10 px-2 py-0.5 text-xs">{formatRoleLabel(u.rol)}</span>
                  </td>
                  <td className="px-4 py-2 text-neutral-500">{u.created_at ? new Date(u.created_at).toLocaleDateString("es-CL") : "—"}</td>
                  <td className="px-4 py-2">
                    {u.must_change_password ? (
                      <span className="rounded bg-amber-400/20 px-2 py-0.5 text-xs font-semibold text-amber-300">Debe cambiar</span>
                    ) : (
                      <span className="rounded bg-emerald-400/20 px-2 py-0.5 text-xs font-semibold text-emerald-300">Actualizada</span>
                    )}
                  </td>
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
              {!filteredRows.length ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-neutral-500">
                    No hay usuarios para mostrar con los filtros actuales.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {createOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
          <div
            role="dialog"
            aria-labelledby="usuario-nuevo-title"
            className="flex max-h-[min(92vh,880px)] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-white/15 bg-[#141c28] shadow-xl"
          >
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-white/10 px-5 py-4 sm:px-6">
              <div>
                <h3 id="usuario-nuevo-title" className="text-lg font-bold text-white">
                  Nuevo usuario
                </h3>
                <p className="mt-1 text-sm text-neutral-400">Alta individual con opción de forzar cambio de contraseña en primer ingreso.</p>
              </div>
              <button
                type="button"
                className="shrink-0 rounded-lg border border-white/20 px-3 py-1 text-sm text-neutral-300 hover:bg-white/5"
                onClick={() => setCreateOpen(false)}
              >
                Cerrar
              </button>
            </div>
            <form onSubmit={(e) => void crearUsuario(e)} className="flex min-h-0 flex-1 flex-col">
              <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto px-5 py-5 sm:grid-cols-2 sm:px-6">
                <label className="text-sm">
                  <span className="block text-neutral-400">Nombre (opcional)</span>
                  <input name="nombre" autoComplete="given-name" className="mt-1 w-full rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-white" />
                </label>
                <label className="text-sm">
                  <span className="block text-neutral-400">Apellido (opcional)</span>
                  <input name="apellido" autoComplete="family-name" className="mt-1 w-full rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-white" />
                </label>
                <label className="text-sm sm:col-span-2">
                  <span className="block text-neutral-400">Email</span>
                  <input required name="email" type="email" autoComplete="email" className="mt-1 w-full rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-white" />
                </label>
                <label className="text-sm">
                  <span className="block text-neutral-400">RUT (opcional)</span>
                  <input name="rut" className="mt-1 w-full rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-white" />
                </label>
                <label className="text-sm">
                  <span className="block text-neutral-400">Teléfono (opcional)</span>
                  <input name="telefono" type="tel" autoComplete="tel" className="mt-1 w-full rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-white" />
                </label>
                <label className="text-sm sm:col-span-2">
                  <span className="block text-neutral-400">Dirección (opcional)</span>
                  <input name="direccion" autoComplete="street-address" className="mt-1 w-full rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-white" />
                </label>
                <label className="text-sm">
                  <span className="block text-neutral-400">Contraseña</span>
                  <input required name="password" type="password" minLength={6} defaultValue="Vedisa" autoComplete="new-password" className="mt-1 w-full rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-white" />
                </label>
                <label className="text-sm">
                  <span className="block text-neutral-400">Repetir contraseña</span>
                  <input required name="password2" type="password" minLength={6} defaultValue="Vedisa" autoComplete="new-password" className="mt-1 w-full rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-white" />
                </label>
                <label className="text-sm sm:col-span-2">
                  <span className="block text-neutral-400">Tipo de usuario</span>
                  <select name="rol" required defaultValue="cliente_remate" className="mt-1 w-full rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-white">
                    {ADMIN_CREATABLE_ROLES.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm sm:col-span-2">
                  <span className="block text-neutral-400">Empresa (opcional)</span>
                  <input name="empresa" autoComplete="organization" className="mt-1 w-full rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-white" />
                </label>
                <label className="flex items-center gap-2 text-sm text-neutral-300 sm:col-span-2">
                  <input type="checkbox" checked={forceChangeOnCreate} onChange={(e) => setForceChangeOnCreate(e.target.checked)} className="h-4 w-4 rounded border-white/20 bg-black/25" />
                  Forzar cambio de contraseña en primer ingreso
                </label>
              </div>
              <div className="flex shrink-0 flex-wrap gap-3 border-t border-white/10 bg-[#141c28] px-5 py-4 sm:px-6">
                <button type="button" className="rounded-lg border border-white/20 px-4 py-2 text-sm text-white hover:bg-white/5" onClick={() => setCreateOpen(false)}>
                  Cancelar
                </button>
                <button disabled={creating} type="submit" className="rounded-lg bg-[#33C7E3] px-4 py-2 text-sm font-bold text-[#0f1f2c] hover:brightness-105 disabled:opacity-50">
                  {creating ? "Creando..." : "Crear usuario"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {importOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
          <div className="w-full max-w-2xl rounded-xl border border-white/15 bg-[#141c28] p-6 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-white">Importar usuarios desde CSV</h3>
                <p className="mt-1 text-sm text-neutral-400">Archivo esperado: `First Name;Last Name;Email Address`.</p>
              </div>
              <button type="button" className="rounded-lg border border-white/20 px-3 py-1 text-sm text-neutral-300 hover:bg-white/5" onClick={() => setImportOpen(false)}>
                Cerrar
              </button>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="text-sm sm:col-span-2">
                <span className="block text-neutral-400">Archivo CSV</span>
                <input type="file" accept=".csv,text/csv" onChange={(e) => void onSelectCsvFile(e)} className="mt-1 w-full rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-white file:mr-3 file:rounded-md file:border-0 file:bg-[#33C7E3] file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-[#0f1f2c]" />
              </label>
              <label className="text-sm">
                <span className="block text-neutral-400">Rol a asignar</span>
                <select value={importRole} onChange={(e) => setImportRole(e.target.value)} className="mt-1 w-full rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-white">
                  {ADMIN_CREATABLE_ROLES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                <span className="block text-neutral-400">Contraseña inicial</span>
                <input value={importPassword} onChange={(e) => setImportPassword(e.target.value)} minLength={6} className="mt-1 w-full rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-white" />
              </label>
            </div>

            <div className="mt-4 rounded-lg border border-white/10 bg-black/20 px-4 py-3 text-sm text-neutral-300">
              <p>
                Archivo: <strong className="text-neutral-100">{importFileName || "sin seleccionar"}</strong>
              </p>
              <p className="mt-1">
                Registros listos para importar: <strong className="text-[#33C7E3]">{importRows.length}</strong>
              </p>
              <p className="mt-1 text-neutral-400">A cada usuario se le marcará cambio obligatorio de contraseña en su primer ingreso.</p>
            </div>

            {importResult ? (
              <div className="mt-4 rounded-lg border border-white/10 bg-black/20 px-4 py-3 text-sm">
                <p className="text-emerald-300">Creados: {importResult.created}</p>
                <p className="text-amber-300">Con error: {importResult.failed}</p>
                {importResult.errors.length ? (
                  <div className="mt-2 max-h-28 overflow-auto text-xs text-neutral-400">
                    {importResult.errors.map((err) => (
                      <p key={err}>{err}</p>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="mt-5 flex gap-3">
              <button type="button" className="rounded-lg border border-white/20 px-4 py-2 text-sm text-white hover:bg-white/5" onClick={() => setImportOpen(false)}>
                Cancelar
              </button>
              <button
                type="button"
                disabled={!importRows.length || importing || importPassword.length < 6}
                onClick={() => void importCsvUsers()}
                className="rounded-lg bg-[#33C7E3] px-4 py-2 text-sm font-bold text-[#0f1f2c] disabled:opacity-60"
              >
                {importing ? "Importando..." : "Importar usuarios"}
              </button>
            </div>
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
                <input required name="password" minLength={6} type="password" className="mt-1 w-full rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-white" />
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
