/** Fila del listado administrativo de usuarios */
export type ListaUsuarioRow = {
  id: string;
  email: string | null;
  nombre: string | null;
  rol: string | null;
  created_at: string | null;
  must_change_password?: boolean | null;
  garantia_aprobada?: boolean | null;
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

export type PortalRematesConfigRow = {
  id: number;
  anti_sniping_enabled: boolean;
  anti_sniping_window_seconds: number;
  anti_sniping_extend_seconds: number;
  high_bid_confirm_multiplier: number;
  max_bids_per_minute: number;
  suspicious_raise_multiplier: number;
  last_minutes_notice_seconds: number;
  tie_breaker_mode: "earliest" | "latest";
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
  estado: "pendiente" | "activo" | "pausado" | "adjudicado" | "vendido" | "anulado";
  precio_reserva?: number | null;
};

export type PortalOfertaRow = {
  id: string;
  created_at: string;
  lote_id: string;
  user_id: string;
  monto: number;
};

export type PortalLoteFavoritoRow = {
  user_id: string;
  lote_id: string;
  notify_email: boolean;
  created_at: string;
};

/** Fila de `portal_listar_mis_ofertas()` */
export type PortalMisOfertaRow = {
  oferta_id: string;
  created_at: string;
  monto: number;
  lote_id: string;
  lote_titulo: string;
  remate_id: string;
  remate_titulo: string;
  remate_estado: string;
  resultado: "ganado" | "no_ganado" | "pendiente";
};

/** Inventario Tasaciones Vedisa: columnas comunes; el resto llega como Record */
export type InventarioRow = {
  id: string;
  created_at?: string;
  patente?: string | null;
  marca?: string | null;
  modelo?: string | null;
  ano?: string | null;
  categoria?: string | null;
  /** Estado operativo del vehículo (texto Tasaciones Vedisa); puede variar por despliegue */
  estado?: string | null;
  empresa?: string | null;
  valor_minimo?: number | null;
  valor_esperado?: number | null;
  imagenes?: string[] | null;
  descripcion?: string | null;
};

export type PortalRemateRecomendadoRow = {
  remate_id: string;
  titulo: string;
  starts_at: string | null;
  ends_at: string;
  score: number;
  motivo: string;
};
