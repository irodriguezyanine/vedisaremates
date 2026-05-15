"use client";

import { type ChangeEvent, type FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import type { ListaUsuarioRow } from "@/lib/portal-types";
import { ADMIN_CREATABLE_ROLES, formatRoleLabel } from "@/lib/role-labels";
import { SupabaseDeployWarning } from "@/components/supabase-deploy-warning";
import { useStyledDialogs } from "@/components/ui/use-styled-dialogs";
import { createClient } from "@/lib/supabase/client";
import { getPublicSupabaseEnv, isSupabaseConfigured } from "@/lib/supabase/public-env";

type TabKey = "staff" | "cliente_remate";
type SortKey = "email" | "nombre" | "rol" | "garantia" | "created_at";
type SortDir = "asc" | "desc";

type ImportRow = {
  username: string;
  nombre: string;
  apellido: string;
  email: string;
};

type ImportProgress = {
  phase: "validating" | "creating";
  current: number;
  total: number;
  created: number;
  updated: number;
  failed: number;
  skipped: number;
};

type ImportColumnKey = "username" | "email" | "nombre" | "apellido";
type ImportColumnMapping = Record<ImportColumnKey, number>;
type ParsedImportCsv = {
  headers: string[];
  rows: string[][];
};

type EditUserForm = {
  userId: string;
  email: string;
  username: string;
  nombre: string;
  apellido: string;
  rut: string;
  direccion: string;
  telefono: string;
  rol: string;
  mustChangePassword: boolean;
  garantiaAprobada: boolean;
  password: string;
};

const USERS_PER_PAGE = 20;
const IMPORT_CONCURRENCY = 12;

function friendlyCreateError(raw: string): string {
  const s = raw.toLowerCase();
  if (s.includes("no se pudo listar usuarios auth") || s.includes("no se pudo resolver usuario por email")) {
    return "No pudimos resolver el usuario en autenticación. Reintenta y, si persiste, contacta soporte.";
  }
  if (s.includes("no existe usuario auth")) {
    return "No existe cuenta de autenticación para ese correo.";
  }
  if (s.includes("sin_permiso")) return "Tu usuario no tiene permisos de administrador para esta acción.";
  if (s.includes("rol_invalido")) return "El rol seleccionado no es válido.";
  if (s.includes("rol_fk_no_encontrada")) return "No se pudo resolver la configuración de roles en la base de datos.";
  if (s.includes("usuario_no_encontrado")) return "No se encontró el usuario en autenticación.";
  if (s.includes("perfil_no_encontrado")) return "No se encontró el perfil del usuario.";
  if (s.includes("email_invalido")) return "El email ingresado no es válido.";
  if (s.includes("email_duplicado")) return "Ese email ya está registrado por otro usuario.";
  if (s.includes("username_duplicado")) return "Ese nombre de usuario ya está asignado a otra cuenta.";
  if (s.includes("username_invalido")) return "El nombre de usuario contiene caracteres no válidos.";
  if (s.includes("fetch") || s.includes("failed")) return "No se pudo contactar el servicio. Intente nuevamente en unos minutos.";
  if (s.includes("session") || s.includes("sesión")) return raw;
  if (s.includes("already registered") || s.includes("duplicate") || s.includes("already been registered")) return "Ese correo ya tiene una cuenta.";
  if (s.includes("email address is invalid")) return "Correo no válido.";
  return raw.replace(/\bsupabase\b/gi, "").trim() || "No se pudo completar la acción.";
}

function normalize(v: unknown): string {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function parseSearchTerms(raw: string): string[] {
  const clean = String(raw ?? "").trim();
  if (!clean) return [];
  return clean
    .split(/[\s,;]+/g)
    .map((token) => normalize(token))
    .filter(Boolean);
}

function normalizeUsernameValue(v: unknown): string {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^A-Za-z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[_\-.]+|[_\-.]+$/g, "");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function normalizeRoleInput(rol: string | null | undefined): string {
  const value = normalize(rol);
  if (!value) return "usuario";
  if (value === "cliente_remate") return "cliente-remate";
  return value;
}

function buildRoleCandidates(rol: string | null | undefined): string[] {
  const base = normalizeRoleInput(rol);
  const candidates = [base];
  const normalized = normalize(base);
  if (normalized.includes("clienteremate")) {
    candidates.push("cliente-remate", "cliente_remate", "cliente remate", "cliente-remates", "cliente_remates", "cliente remates");
  }
  return Array.from(new Set(candidates.map((v) => v.trim()).filter(Boolean)));
}

function isClienteRemate(rol: string | null | undefined): boolean {
  const value = normalize(rol);
  return value === "cliente_remate" || value === "cliente-remate" || value === "cliente remate";
}

function csvSafe(text: string): string {
  const value = text.replace(/"/g, '""');
  return `"${value}"`;
}

function garantiaSortWeight(value: boolean | null | undefined): number {
  if (value === true) return 2; // habilitada
  if (value == null) return 1; // pendiente
  return 0; // no habilitada
}

function parseCsvLine(line: string, delimiter: string): string[] {
  const cols: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === delimiter && !inQuotes) {
      cols.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  cols.push(current.trim());
  return cols;
}

function detectDelimiter(headerLine: string): string {
  const semicolons = (headerLine.match(/;/g) ?? []).length;
  const commas = (headerLine.match(/,/g) ?? []).length;
  return semicolons >= commas ? ";" : ",";
}

function parseImportCsv(raw: string): ParsedImportCsv {
  const lines = raw
    .replace(/^\ufeff/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return { headers: [], rows: [] };
  const delimiter = detectDelimiter(lines[0]);
  const firstRow = parseCsvLine(lines[0], delimiter);
  const firstNormalized = firstRow.map((h) => normalize(h));
  const knownHeaderTokens = new Set([
    "user name",
    "username",
    "nombre de usuario",
    "usuario",
    "login",
    "email",
    "email address",
    "emailaddress",
    "correo",
    "e-mail",
    "first name",
    "firstname",
    "nombre",
    "last name",
    "lastname",
    "apellido",
  ]);
  const hasHeader = firstNormalized.some((h) => knownHeaderTokens.has(h));

  if (hasHeader) {
    const rows: string[][] = [];
    for (let i = 1; i < lines.length; i += 1) {
      const cols = parseCsvLine(lines[i], delimiter);
      if (cols.length) rows.push(cols);
    }
    return { headers: firstRow, rows };
  }

  const headers = firstRow.map((_, idx) => `Columna ${idx + 1}`);
  const rows: string[][] = [firstRow];
  for (let i = 1; i < lines.length; i += 1) {
    const cols = parseCsvLine(lines[i], delimiter);
    if (cols.length) rows.push(cols);
  }
  return { headers, rows };
}

function detectDefaultImportMapping(headers: string[]): ImportColumnMapping {
  const normalizedHeaders = headers.map((h) => normalize(h));
  const indexOfAny = (aliases: string[]): number => {
    for (let i = 0; i < normalizedHeaders.length; i += 1) {
      const h = normalizedHeaders[i];
      if (aliases.some((a) => h === normalize(a))) return i;
    }
    return -1;
  };

  const username = indexOfAny(["user name", "username", "nombre de usuario", "usuario", "login"]);
  const email = indexOfAny(["email", "email address", "emailaddress", "correo", "e-mail"]);
  const nombre = indexOfAny(["first name", "firstname", "nombre", "nombres"]);
  const apellido = indexOfAny(["last name", "lastname", "apellido", "apellidos"]);

  return {
    username: username >= 0 ? username : 1,
    email: email >= 0 ? email : 2,
    nombre: nombre >= 0 ? nombre : 0,
    apellido: apellido >= 0 ? apellido : 3,
  };
}

function buildImportRows(parsed: ParsedImportCsv, mapping: ImportColumnMapping): ImportRow[] {
  const rows: ImportRow[] = [];
  const col = (cols: string[], idx: number): string => (idx >= 0 ? cols[idx] ?? "" : "");
  for (let i = 0; i < parsed.rows.length; i += 1) {
    const cols = parsed.rows[i];
    if (!cols.length) continue;
    const nombre = col(cols, mapping.nombre);
    const apellido = col(cols, mapping.apellido);
    const email = col(cols, mapping.email).toLowerCase();
    const username = col(cols, mapping.username);
    if (!email || !email.includes("@")) continue;
    rows.push({ username: username.trim(), nombre: nombre.trim(), apellido: apellido.trim(), email: email.trim() });
  }
  return rows;
}

async function markPasswordChangeRequired(email: string, sb = createClient()) {
  if (!sb) return;
  await sb.rpc("portal_marcar_cambio_clave_por_email", {
    p_email: email,
    p_requerido: true,
  });
}

async function setUsernameByEmail(email: string, username: string, sb = createClient()): Promise<void> {
  const cleanUsername = normalizeUsernameValue(username);
  if (!cleanUsername) return;
  if (!sb) throw new Error("Servicio no disponible");
  const { data, error } = await sb.rpc("portal_admin_set_username_by_email", {
    p_email: email,
    p_username: cleanUsername,
  });
  const res = data as { ok?: boolean; error?: string } | null;
  if (error || !res?.ok) {
    const err = res?.error || error?.message || "No se pudo actualizar nombre de usuario";
    throw new Error(err);
  }
}

async function forceRoleByEmail(email: string, rol: string, sb = createClient()): Promise<void> {
  if (!sb) throw new Error("Servicio no disponible");
  let lastError = "No se pudo asignar el rol solicitado al usuario.";
  const candidates = buildRoleCandidates(rol);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    let needsRetryByProfileState = false;
    for (const candidate of candidates) {
      const { data, error } = await sb.rpc("portal_admin_set_user_role_by_email", {
        p_email: email,
        p_rol: candidate,
      });
      const res = data as { ok?: boolean; error?: string } | null;
      if (!error && res?.ok !== false) return;

      const errCode = normalize(res?.error ?? error?.message ?? "");
      if (errCode.includes("sin_permiso")) {
        lastError = "Tu sesión no tiene permisos de administrador para asignar roles.";
        throw new Error(lastError);
      }
      if (errCode.includes("rol_invalido")) {
        lastError = "El rol seleccionado no es válido.";
        continue;
      }
      if (errCode.includes("perfil_no_encontrado") || errCode.includes("usuario_no_encontrado")) {
        needsRetryByProfileState = true;
        lastError = "El perfil todavía no está listo para asignar rol. Reintentando...";
        continue;
      }
      lastError = "No se pudo asignar el rol solicitado al usuario.";
    }
    if (needsRetryByProfileState && attempt < 4) {
      await sleep(300 * (attempt + 1));
      continue;
    }
    if (attempt < 4) {
      await sleep(250 * (attempt + 1));
    }
  }
  throw new Error(lastError);
}

export function UsuariosPanel() {
  const { confirm, dialogElement } = useStyledDialogs();
  const [users, setUsers] = useState<ListaUsuarioRow[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [pwModal, setPwModal] = useState<{ userId: string; email: string } | null>(null);
  const [editModal, setEditModal] = useState<EditUserForm | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("staff");
  const [globalSearch, setGlobalSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [forceChangeOnCreate, setForceChangeOnCreate] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkRole, setBulkRole] = useState("cliente-remate");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkActionsOpen, setBulkActionsOpen] = useState(false);
  const [bulkMsg, setBulkMsg] = useState<string | null>(null);

  const [importOpen, setImportOpen] = useState(false);
  const [importFileName, setImportFileName] = useState("");
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [importParsed, setImportParsed] = useState<ParsedImportCsv | null>(null);
  const [importMapping, setImportMapping] = useState<ImportColumnMapping>({
    username: 1,
    email: 2,
    nombre: 0,
    apellido: 3,
  });
  const [importColumnsOpen, setImportColumnsOpen] = useState(false);
  const [importRole, setImportRole] = useState("cliente-remate");
  const [importing, setImporting] = useState(false);
  const [importPassword, setImportPassword] = useState("Vedisa");
  const [importResult, setImportResult] = useState<{
    created: number;
    updated: number;
    failed: number;
    skipped: number;
    errors: string[];
  } | null>(null);
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null);

  const load = useCallback(async () => {
    setLoadErr(null);
    const supabase = createClient();
    if (!supabase) {
      setLoadErr("El acceso a datos no está configurado en este entorno.");
      return;
    }
    const { data, error } = await supabase.rpc("listar_usuarios");
    if (error) {
      setLoadErr("No se pudo cargar el listado. Verifique permisos o vuelva a intentarlo.");
      return;
    }
    const rows = (((data ?? []) as ListaUsuarioRow[]) || []).map((u) => ({ ...u }));
    const ids = rows.map((u) => String(u.id ?? "").trim()).filter(Boolean);
    if (!ids.length) {
      setUsers(rows);
      return;
    }

    // Normaliza garantía desde profiles para evitar desincronización del RPC listar_usuarios.
    const garantiaRes = await fetch("/api/admin/users/garantia-map", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userIds: ids }),
    });
    if (!garantiaRes.ok) {
      setUsers((prev) => {
        const prevGarantia = new Map(prev.map((u) => [u.id, u.garantia_aprobada ?? null] as const));
        return rows.map((u) => ({
          ...u,
          garantia_aprobada: u.garantia_aprobada ?? prevGarantia.get(u.id) ?? false,
        }));
      });
      return;
    }
    const garantiaJson = (await garantiaRes.json().catch(() => ({}))) as {
      ok?: boolean;
      rows?: Array<{ id: string; garantia_aprobada: boolean | null }>;
    };
    if (!garantiaJson.ok || !Array.isArray(garantiaJson.rows)) {
      setUsers((prev) => {
        const prevGarantia = new Map(prev.map((u) => [u.id, u.garantia_aprobada ?? null] as const));
        return rows.map((u) => ({
          ...u,
          garantia_aprobada: u.garantia_aprobada ?? prevGarantia.get(u.id) ?? false,
        }));
      });
      return;
    }

    const garantiaMap = new Map<string, boolean | null>();
    for (const row of garantiaJson.rows) {
      garantiaMap.set(String(row.id), row.garantia_aprobada ?? null);
    }
    setUsers((prev) => {
      const prevGarantia = new Map(prev.map((u) => [u.id, u.garantia_aprobada ?? null] as const));
      return rows.map((u) => ({
        ...u,
        garantia_aprobada: garantiaMap.has(u.id)
          ? (garantiaMap.get(u.id) ?? null)
          : (u.garantia_aprobada ?? prevGarantia.get(u.id) ?? false),
      }));
    });
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
    const rol = normalizeRoleInput(String(fd.get("rol") ?? "cliente-remate"));

    if (password !== password2) {
      setLoadErr("Las contraseñas no coinciden.");
      setCreating(false);
      return;
    }
    if (existingEmailSet.has(normalize(email))) {
      setLoadErr("Ese correo ya existe. No se creó ni modificó la cuenta existente.");
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
      if (!session) throw new Error("Sesión caducada. Vuelva a iniciar sesión.");

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
      await forceRoleByEmail(email, rol, supabase);
      if (forceChangeOnCreate) {
        await markPasswordChangeRequired(email, supabase);
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

  async function abrirEditorUsuario(row: ListaUsuarioRow) {
    setLoadErr(null);
    const baseForm: EditUserForm = {
      userId: row.id,
      email: (row.email ?? "").trim(),
      username: "",
      nombre: (row.nombre ?? "").trim(),
      apellido: "",
      rut: "",
      direccion: "",
      telefono: "",
      rol: normalizeRoleInput(row.rol ?? "usuario"),
      mustChangePassword: Boolean(row.must_change_password),
      garantiaAprobada: Boolean(row.garantia_aprobada),
      password: "",
    };
    setEditModal(baseForm);

    try {
      const supabase = createClient();
      if (!supabase) throw new Error("Servicio no disponible");
      const { data, error } = await supabase.rpc("portal_admin_get_usuario_detalle", {
        p_user_id: row.id,
      });
      const res = data as
        | {
            ok?: boolean;
            error?: string;
            user?: {
              id?: string;
              email?: string | null;
              username?: string | null;
              nombre?: string | null;
              apellido?: string | null;
              rut?: string | null;
              direccion?: string | null;
              telefono?: string | null;
              rol?: string | null;
              must_change_password?: boolean | null;
              garantia_aprobada?: boolean | null;
            };
          }
        | null;
      if (error || !res?.ok || !res.user) return;
      setEditModal((curr) => {
        if (!curr || curr.userId !== row.id) return curr;
        return {
          ...curr,
          email: (res.user?.email ?? curr.email ?? "").trim(),
          username: (res.user?.username ?? curr.username ?? "").trim(),
          nombre: (res.user?.nombre ?? curr.nombre ?? "").trim(),
          apellido: (res.user?.apellido ?? "").trim(),
          rut: (res.user?.rut ?? "").trim(),
          direccion: (res.user?.direccion ?? "").trim(),
          telefono: (res.user?.telefono ?? "").trim(),
          rol: normalizeRoleInput(res.user?.rol ?? curr.rol ?? "usuario"),
          mustChangePassword: Boolean(res.user?.must_change_password),
          garantiaAprobada: Boolean(res.user?.garantia_aprobada),
        };
      });
    } catch {
      // El editor abre con los datos de la tabla aunque falle el detalle.
    }
  }

  async function guardarEdicionUsuario(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    if (!editModal || savingEdit) return;
    setSavingEdit(true);
    setLoadErr(null);
    try {
      const supabase = createClient();
      if (!supabase) throw new Error("Servicio no disponible");
      const payload = {
        p_user_id: editModal.userId,
        p_email: editModal.email.trim().toLowerCase(),
        p_username: normalizeUsernameValue(editModal.username),
        p_nombre: editModal.nombre.trim(),
        p_apellido: editModal.apellido.trim(),
        p_rut: editModal.rut.trim(),
        p_direccion: editModal.direccion.trim(),
        p_telefono: editModal.telefono.trim(),
        p_must_change_password: editModal.mustChangePassword,
        p_garantia_aprobada: editModal.garantiaAprobada,
      };
      const roleCandidates = buildRoleCandidates(editModal.rol);
      let updateOk = false;
      let updateRawError = "No se pudo actualizar el usuario";
      for (const candidate of roleCandidates) {
        const { data, error } = await supabase.rpc("portal_admin_update_usuario", {
          ...payload,
          p_rol: candidate,
        });
        const res = data as { ok?: boolean; error?: string } | null;
        if (!error && res?.ok !== false) {
          updateOk = true;
          break;
        }
        const errText = res?.error || error?.message || "No se pudo actualizar el usuario";
        updateRawError = errText;
        if (normalize(errText).includes("rol_invalido")) {
          continue;
        }
        throw new Error(friendlyCreateError(errText));
      }
      if (!updateOk) {
        throw new Error(friendlyCreateError(updateRawError));
      }

      const newPassword = editModal.password.trim();
      if (newPassword.length > 0) {
        if (newPassword.length < 6) throw new Error("La contraseña debe tener al menos 6 caracteres.");
        const resp = await fetch("/api/admin/users/password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: editModal.userId, email: editModal.email, password: newPassword }),
        });
        const json = (await resp.json().catch(() => ({}))) as { error?: string };
        if (!resp.ok || json.error) {
          throw new Error(friendlyCreateError(json.error || "Error al actualizar contraseña"));
        }
      }

      setEditModal(null);
      await load();
    } catch (e: unknown) {
      setLoadErr(friendlyCreateError(e instanceof Error ? e.message : "Error"));
    } finally {
      setSavingEdit(false);
    }
  }

  async function actualizarPass(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    if (!pwModal) return;
    const fd = new FormData(ev.currentTarget);
    const password = String(fd.get("password") ?? "");
    try {
      const res = await fetch("/api/admin/users/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: pwModal.userId, email: pwModal.email, password }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
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
  const existingEmailSet = useMemo(() => {
    const set = new Set<string>();
    for (const u of users) {
      const email = normalize(u.email);
      if (email) set.add(email);
    }
    return set;
  }, [users]);

  const filteredRows = useMemo(() => {
    const g = normalize(globalSearch);
    const terms = parseSearchTerms(globalSearch);
    const isMultiTerm = terms.length > 1;
    return tabRows.filter((u) => {
      const emailNorm = normalize(u.email ?? "");
      const allCols = [
        u.email ?? "",
        u.nombre ?? "",
        formatRoleLabel(u.rol),
        u.created_at ? new Date(u.created_at).toLocaleDateString("es-CL") : "",
      ]
        .join(" | ")
        .toLowerCase();
      const allNorm = normalize(allCols);
      const globalOk = !g
        ? true
        : isMultiTerm
          ? terms.some((term) => (term.includes("@") ? emailNorm === term : allNorm.includes(term)))
          : allNorm.includes(g);
      return globalOk;
    });
  }, [globalSearch, tabRows]);

  const sortedRows = useMemo(() => {
    const sorted = [...filteredRows];
    const dir = sortDir === "asc" ? 1 : -1;
    sorted.sort((a, b) => {
      let av = "";
      let bv = "";
      if (sortKey === "email") {
        av = normalize(a.email);
        bv = normalize(b.email);
      } else if (sortKey === "nombre") {
        av = normalize(a.nombre);
        bv = normalize(b.nombre);
      } else if (sortKey === "rol") {
        av = normalize(formatRoleLabel(a.rol));
        bv = normalize(formatRoleLabel(b.rol));
      } else if (sortKey === "created_at") {
        const at = a.created_at ? new Date(a.created_at).getTime() : 0;
        const bt = b.created_at ? new Date(b.created_at).getTime() : 0;
        return (at - bt) * dir;
      } else {
        const ag = garantiaSortWeight(a.garantia_aprobada);
        const bg = garantiaSortWeight(b.garantia_aprobada);
        return (ag - bg) * dir;
      }
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
    return sorted;
  }, [filteredRows, sortDir, sortKey]);

  const filteredIds = useMemo(() => sortedRows.map((r) => r.id), [sortedRows]);
  const selectedCount = useMemo(() => {
    let count = 0;
    for (const id of filteredIds) {
      if (selectedIds.has(id)) count += 1;
    }
    return count;
  }, [filteredIds, selectedIds]);
  const allFilteredSelected = filteredIds.length > 0 && selectedCount === filteredIds.length;

  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, globalSearch]);

  useEffect(() => {
    setSelectedIds((prev) => {
      if (activeTab !== "cliente_remate") return new Set();
      const allowed = new Set(tabRows.map((u) => u.id));
      const next = new Set<string>();
      for (const id of prev) {
        if (allowed.has(id)) next.add(id);
      }
      return next;
    });
  }, [activeTab, tabRows]);

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / USERS_PER_PAGE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedRows = useMemo(() => {
    const start = (safeCurrentPage - 1) * USERS_PER_PAGE;
    return sortedRows.slice(start, start + USERS_PER_PAGE);
  }, [safeCurrentPage, sortedRows]);

  function onSortColumn(key: SortKey) {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir("asc");
  }

  function sortIndicator(key: SortKey): string {
    if (sortKey !== key) return "↕";
    return sortDir === "asc" ? "↑" : "↓";
  }

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
    const parsed = parseImportCsv(txt);
    const mapping = detectDefaultImportMapping(parsed.headers);
    const builtRows = buildImportRows(parsed, mapping);
    setImportFileName(f.name);
    setImportParsed(parsed);
    setImportMapping(mapping);
    setImportRows(builtRows);
    setImportResult(null);
    setImportColumnsOpen(false);
  }

  async function importCsvUsers() {
    if (!importRows.length || importing) return;
    setImporting(true);
    setLoadErr(null);
    setImportResult(null);
    setImportProgress({
      phase: "validating",
      current: 0,
      total: importRows.length,
      created: 0,
      updated: 0,
      failed: 0,
      skipped: 0,
    });
    try {
      const supabase = createClient();
      if (!supabase) throw new Error("Servicio no disponible");
      const pub = getPublicSupabaseEnv();
      if (!pub) throw new Error("Faltan variables de entorno del servidor");
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Sesión caducada. Vuelva a iniciar sesión.");

      let created = 0;
      let updated = 0;
      let failed = 0;
      let skipped = 0;
      const errors: string[] = [];
      const seenInFile = new Set<string>();
      const candidates: ImportRow[] = [];
      const existingCandidates: ImportRow[] = [];
      let lastProgressPush = 0;

      for (let i = 0; i < importRows.length; i += 1) {
        const row = importRows[i];
        const normalizedEmail = normalize(row.email);
        if (!normalizedEmail) {
          failed += 1;
          errors.push(`Fila ${i + 2}: correo inválido.`);
        } else if (seenInFile.has(normalizedEmail)) {
          skipped += 1;
        } else {
          seenInFile.add(normalizedEmail);
          if (existingEmailSet.has(normalizedEmail)) {
            existingCandidates.push(row);
          } else {
            candidates.push(row);
          }
        }

        const current = i + 1;
        const shouldPush = current === importRows.length || current - lastProgressPush >= 50;
        if (shouldPush) {
          lastProgressPush = current;
          setImportProgress({
            phase: "validating",
            current,
            total: importRows.length,
            created,
            updated,
            failed,
            skipped,
          });
        }
      }

      setImportProgress({
        phase: "creating",
        current: 0,
        total: Math.max(1, existingCandidates.length + candidates.length),
        created,
        updated,
        failed,
        skipped,
      });

      let createdProcessed = 0;
      let updatedProcessed = 0;

      for (let start = 0; start < existingCandidates.length; start += IMPORT_CONCURRENCY) {
        const batch = existingCandidates.slice(start, start + IMPORT_CONCURRENCY);
        const batchResults = await Promise.all(
          batch.map(async (row) => {
            try {
              await setUsernameByEmail(row.email, row.username, supabase);
              return { ok: true };
            } catch (err) {
              const msg = err instanceof Error ? err.message : "No se pudo actualizar nombre de usuario.";
              return {
                ok: false,
                error: `${row.email}: ${friendlyCreateError(msg)}`,
              };
            }
          }),
        );

        for (const result of batchResults) {
          if (result.ok) updated += 1;
          else {
            failed += 1;
            errors.push(result.error || "No se pudo actualizar un usuario existente.");
          }
          updatedProcessed += 1;
        }

        setImportProgress({
          phase: "creating",
          current: updatedProcessed + createdProcessed,
          total: Math.max(1, existingCandidates.length + candidates.length),
          created,
          updated,
          failed,
          skipped,
        });
      }

      for (let start = 0; start < candidates.length; start += IMPORT_CONCURRENCY) {
        const batch = candidates.slice(start, start + IMPORT_CONCURRENCY);
        const batchResults = await Promise.all(
          batch.map(async (row) => {
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
              return {
                ok: false,
                error: `${row.email}: ${friendlyCreateError(json.error || "Error")}`,
              };
            }
            try {
              await Promise.all([
                forceRoleByEmail(row.email, importRole, supabase),
                markPasswordChangeRequired(row.email, supabase),
                setUsernameByEmail(row.email, row.username, supabase),
              ]);
            } catch {
              return {
                ok: false,
                error: `${row.email}: No se pudo finalizar asignación de rol/clave inicial.`,
              };
            }
            return { ok: true };
          }),
        );

        for (const result of batchResults) {
          if (result.ok) {
            created += 1;
          } else {
            failed += 1;
            errors.push(result.error || "No se pudo procesar un registro.");
          }
          createdProcessed += 1;
        }

        setImportProgress({
          phase: "creating",
          current: updatedProcessed + createdProcessed,
          total: Math.max(1, existingCandidates.length + candidates.length),
          created,
          updated,
          failed,
          skipped,
        });
      }

      setImportResult({ created, updated, failed, skipped, errors: errors.slice(0, 25) });
      await load();
    } catch (e: unknown) {
      setLoadErr(friendlyCreateError(e instanceof Error ? e.message : "Error"));
    } finally {
      setImporting(false);
      setImportProgress(null);
    }
  }

  function toggleSelectRow(userId: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(userId);
      else next.delete(userId);
      return next;
    });
  }

  function toggleSelectAllFiltered(checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        for (const id of filteredIds) next.add(id);
      } else {
        for (const id of filteredIds) next.delete(id);
      }
      return next;
    });
  }

  async function fetchDetalleUsuario(
    userId: string,
    sb: ReturnType<typeof createClient>,
  ): Promise<{
    email: string;
    username: string;
    nombre: string;
    apellido: string;
    rut: string;
    direccion: string;
    telefono: string;
    rol: string;
    mustChangePassword: boolean;
    garantiaAprobada: boolean;
  } | null> {
    if (!sb) return null;
    const { data, error } = await sb.rpc("portal_admin_get_usuario_detalle", {
      p_user_id: userId,
    });
    if (error) return null;
    const res = data as
      | {
          ok?: boolean;
          user?: {
            email?: string | null;
            username?: string | null;
            nombre?: string | null;
            apellido?: string | null;
            rut?: string | null;
            direccion?: string | null;
            telefono?: string | null;
            rol?: string | null;
            must_change_password?: boolean | null;
            garantia_aprobada?: boolean | null;
          };
        }
      | null;
    if (!res?.ok || !res.user) return null;
    return {
      email: String(res.user.email ?? "").trim().toLowerCase(),
      username: String(res.user.username ?? "").trim(),
      nombre: String(res.user.nombre ?? "").trim(),
      apellido: String(res.user.apellido ?? "").trim(),
      rut: String(res.user.rut ?? "").trim(),
      direccion: String(res.user.direccion ?? "").trim(),
      telefono: String(res.user.telefono ?? "").trim(),
      rol: normalizeRoleInput(res.user.rol ?? "usuario"),
      mustChangePassword: Boolean(res.user.must_change_password),
      garantiaAprobada: Boolean(res.user.garantia_aprobada),
    };
  }

  async function bulkUpdateSelected(patch: { garantiaAprobada?: boolean; rol?: string }) {
    if (!selectedIds.size || bulkBusy) return;
    setBulkBusy(true);
    setBulkMsg(null);
    setLoadErr(null);
    try {
      const supabase = createClient();
      if (!supabase) throw new Error("Servicio no disponible");
      const targetIds = new Set(selectedIds);
      let updated = 0;
      let failed = 0;

      // Ruta rápida para garantía masiva: una sola llamada backend (persistente y mucho más rápida).
      if (patch.garantiaAprobada != null && patch.rol == null) {
        const resp = await fetch("/api/admin/users/garantia-bulk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userIds: [...targetIds],
            garantiaAprobada: patch.garantiaAprobada,
          }),
        });
        const json = (await resp.json().catch(() => ({}))) as { ok?: boolean; updated?: number; failed?: number; error?: string };
        if (!resp.ok || !json.ok) {
          throw new Error(friendlyCreateError(json.error ?? "No se pudo actualizar garantía en forma masiva."));
        }
        updated = Number(json.updated ?? 0);
        failed = Number(json.failed ?? 0);
      } else {
      for (const userId of targetIds) {
        const detalle = await fetchDetalleUsuario(userId, supabase);
        if (!detalle) {
          failed += 1;
          continue;
        }
        const candidates = buildRoleCandidates(patch.rol ?? detalle.rol);
        let ok = false;
        for (const candidate of candidates) {
          const { data, error } = await supabase.rpc("portal_admin_update_usuario", {
            p_user_id: userId,
            p_email: detalle.email,
            p_username: normalizeUsernameValue(detalle.username),
            p_nombre: detalle.nombre,
            p_apellido: detalle.apellido,
            p_rut: detalle.rut,
            p_direccion: detalle.direccion,
            p_telefono: detalle.telefono,
            p_rol: candidate,
            p_must_change_password: detalle.mustChangePassword,
            p_garantia_aprobada:
              patch.garantiaAprobada != null ? patch.garantiaAprobada : detalle.garantiaAprobada,
          });
          const res = data as { ok?: boolean; error?: string } | null;
          if (!error && res?.ok !== false) {
            ok = true;
            break;
          }
        }
        if (ok) updated += 1;
        else failed += 1;
      }
      }
      setBulkMsg(`Acción masiva finalizada. Actualizados: ${updated}. Fallidos: ${failed}.`);
      if (updated > 0) {
        setUsers((prev) =>
          prev.map((u) => {
            if (!targetIds.has(u.id)) return u;
            return {
              ...u,
              rol: patch.rol != null ? patch.rol : u.rol,
              garantia_aprobada: patch.garantiaAprobada != null ? patch.garantiaAprobada : u.garantia_aprobada,
            };
          }),
        );
        await load();
      }
    } catch (e: unknown) {
      setLoadErr(friendlyCreateError(e instanceof Error ? e.message : "Error"));
    } finally {
      setBulkBusy(false);
    }
  }

  async function bulkDeleteSelected() {
    if (!selectedIds.size || bulkBusy) return;
    const ok = await confirm({
      title: "Eliminar usuarios",
      message: `¿Eliminar ${selectedIds.size} usuarios seleccionados?\n\nEsta acción no se puede deshacer.`,
      confirmText: "Sí, eliminar",
      cancelText: "Cancelar",
      variant: "danger",
    });
    if (!ok) return;
    setBulkBusy(true);
    setBulkMsg(null);
    setLoadErr(null);
    try {
      const supabase = createClient();
      if (!supabase) throw new Error("Servicio no disponible");
      let deleted = 0;
      let failed = 0;
      for (const userId of selectedIds) {
        const { data, error } = await supabase.rpc("portal_admin_delete_usuario", {
          p_user_id: userId,
        });
        const res = data as { ok?: boolean } | null;
        if (!error && res?.ok) deleted += 1;
        else failed += 1;
      }
      setBulkMsg(`Eliminación masiva finalizada. Eliminados: ${deleted}. Fallidos: ${failed}.`);
      if (deleted > 0) {
        setSelectedIds(new Set());
        await load();
      }
    } catch (e: unknown) {
      setLoadErr(friendlyCreateError(e instanceof Error ? e.message : "Error"));
    } finally {
      setBulkBusy(false);
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
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/20 text-neutral-200 transition hover:bg-white/5"
            aria-label="Descargar lista filtrada"
            title="Descargar lista filtrada"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M12 3v10" strokeLinecap="round" />
              <path d="m7 10 5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M4 19h16" strokeLinecap="round" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => setImportOpen(true)}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#33C7E3]/40 text-[#33C7E3] transition hover:bg-[#33C7E3]/10"
            aria-label="Importar CSV"
            title="Importar CSV"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M12 21V11" strokeLinecap="round" />
              <path d="m17 14-5-5-5 5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M4 5h16" strokeLinecap="round" />
            </svg>
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
            <label className="text-sm md:col-span-3">
              <span className="block text-neutral-400">Buscador en cualquier columna</span>
              <input
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
                placeholder="Buscar por email, nombre, rol o fecha. Puede pegar varios correos separados por espacio/coma."
                className="mt-1 w-full rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-white placeholder:text-neutral-600"
              />
            </label>
          </div>
          {activeTab === "cliente_remate" ? (
            <div className="rounded-lg border border-white/10 bg-black/20 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex items-center gap-2 text-xs text-neutral-300">
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    onChange={(e) => toggleSelectAllFiltered(e.target.checked)}
                    className="h-4 w-4 rounded border-white/20 bg-black/25"
                  />
                  Seleccionar todos los filtrados ({filteredRows.length})
                </label>
                <span className="text-xs text-neutral-500">Seleccionados: {selectedCount}</span>
                <div className="relative ml-auto">
                  <button
                    type="button"
                    disabled={bulkBusy}
                    onClick={() => setBulkActionsOpen((v) => !v)}
                    className="inline-flex items-center gap-2 rounded-lg border border-white/20 px-3 py-1.5 text-xs font-semibold text-neutral-200 disabled:opacity-40"
                  >
                    <span>Opciones</span>
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                      <circle cx="5" cy="12" r="1.5" />
                      <circle cx="12" cy="12" r="1.5" />
                      <circle cx="19" cy="12" r="1.5" />
                    </svg>
                  </button>
                  {bulkActionsOpen ? (
                    <div className="absolute right-0 z-20 mt-2 w-[min(18rem,calc(100vw-2rem))] rounded-lg border border-white/10 bg-[#101722] p-3 shadow-xl">
                      <div className="space-y-2">
                        <button
                          type="button"
                          disabled={bulkBusy || selectedCount === 0}
                          onClick={() => {
                            setBulkActionsOpen(false);
                            void bulkUpdateSelected({ garantiaAprobada: true });
                          }}
                          className="w-full rounded-lg border border-emerald-400/30 px-3 py-1.5 text-left text-xs font-semibold text-emerald-200 disabled:opacity-40"
                        >
                          Habilitar garantía
                        </button>
                        <button
                          type="button"
                          disabled={bulkBusy || selectedCount === 0}
                          onClick={() => {
                            setBulkActionsOpen(false);
                            void bulkUpdateSelected({ garantiaAprobada: false });
                          }}
                          className="w-full rounded-lg border border-amber-400/30 px-3 py-1.5 text-left text-xs font-semibold text-amber-200 disabled:opacity-40"
                        >
                          Deshabilitar garantía
                        </button>
                        <div className="rounded-lg border border-white/10 p-2">
                          <p className="mb-1 text-[11px] text-neutral-400">Cambiar rol masivo</p>
                          <div className="flex items-center gap-2">
                            <select
                              value={bulkRole}
                              onChange={(e) => setBulkRole(e.target.value)}
                              className="min-w-0 flex-1 rounded-lg border border-white/15 bg-black/25 px-2 py-1.5 text-xs text-white"
                            >
                              {ADMIN_CREATABLE_ROLES.map((r) => (
                                <option key={r.value} value={r.value}>
                                  {r.label}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              disabled={bulkBusy || selectedCount === 0}
                              onClick={() => {
                                setBulkActionsOpen(false);
                                void bulkUpdateSelected({ rol: bulkRole });
                              }}
                              className="rounded-lg border border-sky-400/30 px-2 py-1.5 text-xs font-semibold text-sky-200 disabled:opacity-40"
                            >
                              Aplicar
                            </button>
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={bulkBusy || selectedCount === 0}
                          onClick={() => {
                            setBulkActionsOpen(false);
                            void bulkDeleteSelected();
                          }}
                          className="w-full rounded-lg border border-red-500/40 px-3 py-1.5 text-left text-xs font-semibold text-red-200 disabled:opacity-40"
                        >
                          Eliminar seleccionados
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
              {bulkMsg ? <p className="mt-2 text-xs text-neutral-400">{bulkMsg}</p> : null}
            </div>
          ) : null}
        </div>
        <div className="overflow-x-auto border-t border-white/10">
          <table className="min-w-[640px] w-full border-collapse text-left text-sm">
            <thead className="text-neutral-500">
              <tr>
                {activeTab === "cliente_remate" ? <th className="px-4 py-2 font-medium">Sel.</th> : null}
                <th className="px-4 py-2 font-medium">
                  <button type="button" onClick={() => onSortColumn("email")} className="inline-flex items-center gap-1 hover:text-neutral-300">
                    Email <span className="text-[11px]">{sortIndicator("email")}</span>
                  </button>
                </th>
                <th className="px-4 py-2 font-medium">
                  <button type="button" onClick={() => onSortColumn("nombre")} className="inline-flex items-center gap-1 hover:text-neutral-300">
                    Nombre <span className="text-[11px]">{sortIndicator("nombre")}</span>
                  </button>
                </th>
                <th className="px-4 py-2 font-medium">
                  <button type="button" onClick={() => onSortColumn("rol")} className="inline-flex items-center gap-1 hover:text-neutral-300">
                    Rol <span className="text-[11px]">{sortIndicator("rol")}</span>
                  </button>
                </th>
                {activeTab === "cliente_remate" ? (
                  <th className="px-4 py-2 font-medium">
                    <button
                      type="button"
                      onClick={() => onSortColumn("garantia")}
                      className="inline-flex items-center gap-1 hover:text-neutral-300"
                    >
                      Garantía <span className="text-[11px]">{sortIndicator("garantia")}</span>
                    </button>
                  </th>
                ) : null}
                <th className="px-4 py-2 font-medium">
                  <button type="button" onClick={() => onSortColumn("created_at")} className="inline-flex items-center gap-1 hover:text-neutral-300">
                    Alta <span className="text-[11px]">{sortIndicator("created_at")}</span>
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {paginatedRows.map((u) => (
                <tr
                  key={u.id}
                  className="cursor-pointer border-t border-white/10 text-neutral-200 transition hover:bg-white/5"
                  onClick={() => void abrirEditorUsuario(u)}
                  title="Haz click para editar usuario"
                >
                  {activeTab === "cliente_remate" ? (
                    <td className="px-4 py-2" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(u.id)}
                        onChange={(e) => toggleSelectRow(u.id, e.target.checked)}
                        className="h-4 w-4 rounded border-white/20 bg-black/25"
                      />
                    </td>
                  ) : null}
                  <td className="px-4 py-2">{u.email}</td>
                  <td className="px-4 py-2">{u.nombre}</td>
                  <td className="px-4 py-2">
                    <span className="rounded bg-white/10 px-2 py-0.5 text-xs">{formatRoleLabel(u.rol)}</span>
                  </td>
                  {activeTab === "cliente_remate" ? (
                    <td className="px-4 py-2">
                      {u.garantia_aprobada === true ? (
                        <span
                          className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-emerald-400/40 bg-emerald-500/10 text-xs text-emerald-200"
                          title="Habilitada"
                          aria-label="Garantía habilitada"
                        >
                          ✓
                        </span>
                      ) : u.garantia_aprobada == null ? (
                        <span
                          className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-amber-400/40 bg-amber-500/10 text-xs text-amber-200"
                          title="Pendiente"
                          aria-label="Garantía pendiente"
                        >
                          ⏳
                        </span>
                      ) : (
                        <span
                          className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-red-400/40 bg-red-500/10 text-xs text-red-200"
                          title="No habilitada"
                          aria-label="Garantía no habilitada"
                        >
                          ✖
                        </span>
                      )}
                    </td>
                  ) : null}
                  <td className="px-4 py-2 text-neutral-500">{u.created_at ? new Date(u.created_at).toLocaleDateString("es-CL") : "—"}</td>
                </tr>
              ))}
              {!paginatedRows.length ? (
                <tr>
                  <td colSpan={activeTab === "cliente_remate" ? 6 : 4} className="px-4 py-6 text-center text-neutral-500">
                    No hay usuarios para mostrar con los filtros actuales.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 px-5 py-3 text-sm">
          <p className="text-neutral-400">
            Mostrando {paginatedRows.length} de {sortedRows.length} usuarios (página {safeCurrentPage} de {totalPages}).
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={safeCurrentPage <= 1}
              className="rounded-lg border border-white/20 px-3 py-1.5 text-neutral-200 disabled:opacity-40"
            >
              Anterior
            </button>
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={safeCurrentPage >= totalPages}
              className="rounded-lg border border-white/20 px-3 py-1.5 text-neutral-200 disabled:opacity-40"
            >
              Siguiente
            </button>
          </div>
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
                className="shrink-0 rounded-lg border border-white/20 p-1.5 text-neutral-300 hover:bg-white/5"
                aria-label="Cerrar modal nuevo usuario"
                onClick={() => setCreateOpen(false)}
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            {loadErr ? <p className="mx-5 mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200 sm:mx-6">{loadErr}</p> : null}
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
                  <select name="rol" required defaultValue="cliente-remate" className="mt-1 w-full rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-white">
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
                <p className="mt-1 text-sm text-neutral-400">Archivo esperado: `User Name`, `Email Address`, `First Name`, `Last Name`.</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/20 text-neutral-300 hover:bg-white/5"
                  onClick={() => setImportColumnsOpen((v) => !v)}
                  title="Elegir columnas del CSV"
                  aria-label="Elegir columnas del CSV"
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                    <path d="M3 6h18" strokeLinecap="round" />
                    <path d="M6 12h12" strokeLinecap="round" />
                    <path d="M10 18h4" strokeLinecap="round" />
                  </svg>
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-white/20 p-1.5 text-neutral-300 hover:bg-white/5"
                  aria-label="Cerrar modal de importacion"
                  onClick={() => setImportOpen(false)}
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                    <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            </div>
            {loadErr ? <p className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">{loadErr}</p> : null}

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

            {importColumnsOpen && importParsed?.headers?.length ? (
              <div className="mt-4 rounded-lg border border-white/10 bg-black/20 p-4">
                <p className="text-sm font-semibold text-white">Asignación de columnas CSV</p>
                <p className="mt-1 text-xs text-neutral-400">Selecciona qué columna corresponde a cada campo, incluyendo Nombre de usuario.</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="text-xs">
                    <span className="block text-neutral-400">Nombre de usuario</span>
                    <select
                      value={importMapping.username}
                      onChange={(e) => {
                        const next = { ...importMapping, username: Number(e.target.value) };
                        setImportMapping(next);
                        setImportRows(buildImportRows(importParsed, next));
                        setImportResult(null);
                      }}
                      className="mt-1 w-full rounded-lg border border-white/15 bg-black/25 px-2 py-1.5 text-white"
                    >
                      {importParsed.headers.map((h, idx) => (
                        <option key={`u-${idx}`} value={idx}>
                          {h || `Columna ${idx + 1}`}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs">
                    <span className="block text-neutral-400">Email</span>
                    <select
                      value={importMapping.email}
                      onChange={(e) => {
                        const next = { ...importMapping, email: Number(e.target.value) };
                        setImportMapping(next);
                        setImportRows(buildImportRows(importParsed, next));
                        setImportResult(null);
                      }}
                      className="mt-1 w-full rounded-lg border border-white/15 bg-black/25 px-2 py-1.5 text-white"
                    >
                      {importParsed.headers.map((h, idx) => (
                        <option key={`e-${idx}`} value={idx}>
                          {h || `Columna ${idx + 1}`}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs">
                    <span className="block text-neutral-400">Nombre</span>
                    <select
                      value={importMapping.nombre}
                      onChange={(e) => {
                        const next = { ...importMapping, nombre: Number(e.target.value) };
                        setImportMapping(next);
                        setImportRows(buildImportRows(importParsed, next));
                        setImportResult(null);
                      }}
                      className="mt-1 w-full rounded-lg border border-white/15 bg-black/25 px-2 py-1.5 text-white"
                    >
                      {importParsed.headers.map((h, idx) => (
                        <option key={`n-${idx}`} value={idx}>
                          {h || `Columna ${idx + 1}`}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs">
                    <span className="block text-neutral-400">Apellido</span>
                    <select
                      value={importMapping.apellido}
                      onChange={(e) => {
                        const next = { ...importMapping, apellido: Number(e.target.value) };
                        setImportMapping(next);
                        setImportRows(buildImportRows(importParsed, next));
                        setImportResult(null);
                      }}
                      className="mt-1 w-full rounded-lg border border-white/15 bg-black/25 px-2 py-1.5 text-white"
                    >
                      {importParsed.headers.map((h, idx) => (
                        <option key={`a-${idx}`} value={idx}>
                          {h || `Columna ${idx + 1}`}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
            ) : null}

            <div className="mt-4 rounded-lg border border-white/10 bg-black/20 px-4 py-3 text-sm text-neutral-300">
              <p>
                Archivo: <strong className="text-neutral-100">{importFileName || "sin seleccionar"}</strong>
              </p>
              <p className="mt-1">
                Registros listos para importar: <strong className="text-[#33C7E3]">{importRows.length}</strong>
              </p>
              <p className="mt-1 text-neutral-400">Si el correo ya existe, se actualiza su nombre de usuario. Duplicados dentro del archivo se omiten.</p>
            </div>

            {importResult ? (
              <div className="mt-4 rounded-lg border border-white/10 bg-black/20 px-4 py-3 text-sm">
                <p className="text-emerald-300">Creados: {importResult.created}</p>
                <p className="text-cyan-300">Actualizados existentes: {importResult.updated}</p>
                <p className="text-amber-300">Con error: {importResult.failed}</p>
                <p className="text-sky-300">Omitidos por duplicado en archivo: {importResult.skipped}</p>
                {importResult.errors.length ? (
                  <div className="mt-2 max-h-28 overflow-auto text-xs text-neutral-400">
                    {importResult.errors.map((err) => (
                      <p key={err}>{err}</p>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
            {importing && importProgress ? (
              <div className="mt-4 rounded-lg border border-white/10 bg-black/20 px-4 py-3 text-sm text-neutral-300">
                {(() => {
                  const progressPct = (Math.min(importProgress.current, importProgress.total) / Math.max(1, importProgress.total)) * 100;
                  return (
                    <>
                <p className="font-semibold text-white">
                  {importProgress.phase === "validating" ? "Validando archivo..." : "Creando/actualizando usuarios..."}
                </p>
                <p className="mt-1">
                  Progreso: {progressPct.toFixed(1)}% ({importProgress.current} / {importProgress.total})
                </p>
                <div className="mt-2 h-2 w-full overflow-hidden rounded bg-white/10">
                  <div
                    className="h-full bg-[#33C7E3] transition-all duration-200"
                    style={{
                      width: `${Math.max(0, Math.min(100, progressPct))}%`,
                    }}
                  />
                </div>
                <p className="mt-2 text-xs text-neutral-400">
                  Parcial: creados {importProgress.created}, actualizados {importProgress.updated}, errores {importProgress.failed}, duplicados {importProgress.skipped}
                </p>
                    </>
                  );
                })()}
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
                {importing && importProgress
                  ? `Importando... ${(((Math.min(importProgress.current, importProgress.total) / Math.max(1, importProgress.total)) * 100).toFixed(1))}%`
                  : importing
                    ? "Importando..."
                    : "Importar usuarios"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {editModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
          <div className="w-full max-w-3xl rounded-xl border border-white/15 bg-[#141c28] p-6 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-white">Editar usuario</h3>
                <p className="mt-1 text-sm text-neutral-400">Actualiza datos personales, rol y contraseña.</p>
              </div>
              <button
                type="button"
                className="rounded-lg border border-white/20 p-1.5 text-neutral-300 hover:bg-white/5"
                aria-label="Cerrar modal de edicion"
                onClick={() => setEditModal(null)}
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            {loadErr ? <p className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">{loadErr}</p> : null}

            <form onSubmit={(e) => void guardarEdicionUsuario(e)} className="mt-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm sm:col-span-2">
                  <span className="block text-neutral-400">Email</span>
                  <input
                    type="email"
                    required
                    value={editModal.email}
                    onChange={(e) => setEditModal((curr) => (curr ? { ...curr, email: e.target.value } : curr))}
                    className="mt-1 w-full rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-white"
                  />
                </label>
                <label className="text-sm sm:col-span-2">
                  <span className="block text-neutral-400">Nombre de usuario</span>
                  <input
                    value={editModal.username}
                    onChange={(e) => setEditModal((curr) => (curr ? { ...curr, username: e.target.value } : curr))}
                    placeholder="Ej: JPMONTERO1"
                    className="mt-1 w-full rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-white placeholder:text-neutral-600"
                  />
                </label>
                <label className="text-sm">
                  <span className="block text-neutral-400">Nombre</span>
                  <input
                    value={editModal.nombre}
                    onChange={(e) => setEditModal((curr) => (curr ? { ...curr, nombre: e.target.value } : curr))}
                    className="mt-1 w-full rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-white"
                  />
                </label>
                <label className="text-sm">
                  <span className="block text-neutral-400">Apellido</span>
                  <input
                    value={editModal.apellido}
                    onChange={(e) => setEditModal((curr) => (curr ? { ...curr, apellido: e.target.value } : curr))}
                    className="mt-1 w-full rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-white"
                  />
                </label>
                <label className="text-sm">
                  <span className="block text-neutral-400">RUT</span>
                  <input
                    value={editModal.rut}
                    onChange={(e) => setEditModal((curr) => (curr ? { ...curr, rut: e.target.value } : curr))}
                    className="mt-1 w-full rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-white"
                  />
                </label>
                <label className="text-sm">
                  <span className="block text-neutral-400">Teléfono</span>
                  <input
                    value={editModal.telefono}
                    onChange={(e) => setEditModal((curr) => (curr ? { ...curr, telefono: e.target.value } : curr))}
                    className="mt-1 w-full rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-white"
                  />
                </label>
                <label className="text-sm sm:col-span-2">
                  <span className="block text-neutral-400">Dirección</span>
                  <input
                    value={editModal.direccion}
                    onChange={(e) => setEditModal((curr) => (curr ? { ...curr, direccion: e.target.value } : curr))}
                    className="mt-1 w-full rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-white"
                  />
                </label>
                <label className="text-sm">
                  <span className="block text-neutral-400">Rol</span>
                  <select
                    value={editModal.rol}
                    onChange={(e) => setEditModal((curr) => (curr ? { ...curr, rol: e.target.value } : curr))}
                    className="mt-1 w-full rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-white"
                  >
                    {ADMIN_CREATABLE_ROLES.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
                  <span className="block text-neutral-400">Nueva contraseña (opcional)</span>
                  <input
                    type="password"
                    minLength={6}
                    value={editModal.password}
                    onChange={(e) => setEditModal((curr) => (curr ? { ...curr, password: e.target.value } : curr))}
                    placeholder="Dejar vacío para no cambiar"
                    className="mt-1 w-full rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-white placeholder:text-neutral-600"
                  />
                </label>
                <label className="flex items-center gap-2 text-sm text-neutral-300 sm:col-span-2">
                  <input
                    type="checkbox"
                    checked={editModal.mustChangePassword}
                    onChange={(e) => setEditModal((curr) => (curr ? { ...curr, mustChangePassword: e.target.checked } : curr))}
                    className="h-4 w-4 rounded border-white/20 bg-black/25"
                  />
                  Forzar cambio de contraseña en próximo inicio de sesión
                </label>
                <label className="flex items-center gap-2 text-sm text-neutral-300 sm:col-span-2">
                  <input
                    type="checkbox"
                    checked={editModal.garantiaAprobada}
                    onChange={(e) => setEditModal((curr) => (curr ? { ...curr, garantiaAprobada: e.target.checked } : curr))}
                    className="h-4 w-4 rounded border-white/20 bg-black/25"
                  />
                  Garantía validada (habilita pujas en remates)
                </label>
              </div>

              <div className="mt-6 flex gap-3">
                <button type="button" className="rounded-lg border border-white/20 px-4 py-2 text-sm text-white hover:bg-white/5" onClick={() => setEditModal(null)}>
                  Cancelar
                </button>
                <button type="submit" disabled={savingEdit} className="rounded-lg bg-[#33C7E3] px-4 py-2 text-sm font-bold text-[#0f1f2c] disabled:opacity-60">
                  {savingEdit ? "Guardando..." : "Guardar cambios"}
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
      {dialogElement}
    </div>
  );
}
