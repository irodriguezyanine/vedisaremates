/** Fila típica de listar_usuarios() en Tasaciones */
export type ListaUsuarioRow = {
  id: string;
  email: string | null;
  nombre: string | null;
  rol: string | null;
  created_at: string | null;
};

export type PortalRemateRow = {
  id: string;
  created_at: string;
  updated_at?: string;
  titulo: string;
  descripcion: string | null;
  estado: "borrador" | "publicado" | "en_curso" | "cerrado";
  starts_at: string | null;
  ends_at: string;
  created_by: string | null;
};

export type PortalRemateLoteRow = {
  id: string;
  created_at: string;
  remate_id: string;
  inventario_id: string | null;
  orden: number;
  titulo: string | null;
  descripcion: string | null;
  precio_base: number;
  incremento_minimo: number;
  estado: "pendiente" | "activo" | "vendido" | "anulado";
};

export type PortalOfertaRow = {
  id: string;
  created_at: string;
  lote_id: string;
  user_id: string;
  monto: number;
};

/** Inventario Tasaciones: columnas comunes; el resto llega como Record */
export type InventarioRow = {
  id: string;
  created_at?: string;
  patente?: string | null;
  marca?: string | null;
  modelo?: string | null;
  ano?: string | null;
  categoria?: string | null;
  valor_minimo?: number | null;
  valor_esperado?: number | null;
  imagenes?: string[] | null;
  descripcion?: string | null;
};
