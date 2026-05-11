/** Etiquetas legibles para roles en `profiles` (sin exponer nomenclatura interna). */

const MAP: Record<string, string> = {
  admin: "Administrador",
  usuario: "Usuario",
  cliente_remate: "Cliente–Remate",
  "cliente-remate": "Cliente–Remate",
  "cliente remate": "Cliente–Remate",
  cliente_empresa: "Cliente empresa",
  transportista: "Transportista",
  bodega: "Bodega",
  sac: "SAC",
};

export function formatRoleLabel(rol: string | null | undefined): string {
  if (!rol) return "Usuario";
  const trimmed = rol.trim();
  const key = trimmed.toLowerCase();
  return MAP[key] ?? MAP[trimmed] ?? trimmed.replace(/_/g, " ");
}

export const ADMIN_CREATABLE_ROLES = [
  { value: "cliente-remate" as const, label: "Cliente–Remate (oferta en remates)" },
  { value: "cliente_empresa" as const, label: "Cliente empresa" },
  { value: "transportista" as const, label: "Transportista" },
  { value: "bodega" as const, label: "Bodega" },
  { value: "sac" as const, label: "SAC" },
  { value: "admin" as const, label: "Administrador" },
  { value: "usuario" as const, label: "Usuario estándar" },
];
