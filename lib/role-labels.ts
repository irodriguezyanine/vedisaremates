/** Etiquetas legibles para roles en `profiles` (sin exponer nomenclatura interna). */

const MAP: Record<string, string> = {
  admin: "Administrador",
  usuario: "Usuario",
  cliente_remate: "Cliente–Remate",
  Cliente_empresa: "Cliente empresa",
};

export function formatRoleLabel(rol: string | null | undefined): string {
  if (!rol) return "Usuario";
  const trimmed = rol.trim();
  const key = trimmed.toLowerCase();
  return MAP[key] ?? MAP[trimmed] ?? trimmed.replace(/_/g, " ");
}

export const ADMIN_CREATABLE_ROLES = [
  { value: "cliente_remate" as const, label: "Cliente–Remate (oferta en remates)" },
  { value: "usuario" as const, label: "Usuario estándar" },
];
