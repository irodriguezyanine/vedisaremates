"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { firstGlo3dViewerUrl, getInventarioStaticImageUrls, preferredThumbnailUrl } from "@/lib/inventario-media";
import type { InventarioRow } from "@/lib/portal-types";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/public-env";

type InventarioAnyRow = InventarioRow & Record<string, unknown>;
type BoolFilter = "todos" | "si" | "no";
type LoteJoinRow = {
  id?: string | null;
  inventario: InventarioAnyRow | InventarioAnyRow[] | null;
  portal_remates:
    | { id?: string | null; estado?: string | null; titulo?: string | null; descripcion?: string | null }
    | Array<{ id?: string | null; estado?: string | null; titulo?: string | null; descripcion?: string | null }>
    | null;
};
type SearchRow = {
  inventario: InventarioAnyRow;
  remateId: string | null;
  remateEstado: string | null;
};

type SpecIconName =
  | "km"
  | "year"
  | "fuel"
  | "gear"
  | "engineTest"
  | "movementTest"
  | "conditioned"
  | "singleOwner"
  | "airConditioning"
  | "keys"
  | "traction"
  | "airbags";

type SearchSpec = {
  key: string;
  label: string;
  icon: SpecIconName;
  wide?: boolean;
};

const IMAGE_HINT_KEYS = [
  "glo3d_thumbnail",
  "glo3d_thumb",
  "thumbnail_url",
  "foto_principal",
  "imagen_principal",
  "image_url",
  "imagen_url",
  "photo_url",
];
const GLO3D_HINT_KEYS = ["glo3d", "glo_3d", "glo3d_url", "url_glo3d", "tour_360", "viewer_360"];

function normalize(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function normalizeSearchToken(value: string): string {
  return String(value ?? "")
    .replace(/[,()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseBoolish(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1 ? true : value === 0 ? false : null;
  const t = normalize(value);
  if (!t) return null;
  if (["si", "sí", "true", "1", "ok", "activo", "operativo", "arranca"].includes(t)) return true;
  if (["no", "false", "0", "inactivo", "inoperativo", "no arranca"].includes(t)) return false;
  return null;
}

function unwrapEmb<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

function rowMatchesText(row: InventarioAnyRow, query: string): boolean {
  const q = normalize(query);
  if (!q) return true;
  return Object.values(row).some((value) => {
    if (value == null) return false;
    if (typeof value === "object") return false;
    return normalize(value).includes(q);
  });
}

function rowMatchesBoolFilter(row: InventarioAnyRow, keys: string[], filter: BoolFilter): boolean {
  if (filter === "todos") return true;
  const wanted = filter === "si";
  for (const key of keys) {
    if (!(key in row)) continue;
    const boolValue = parseBoolish(row[key]);
    if (boolValue == null) continue;
    return boolValue === wanted;
  }
  return false;
}

function isHttpUrl(value: unknown): value is string {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}

function firstHttpUrl(value: unknown): string | null {
  if (isHttpUrl(value)) return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const hit = firstHttpUrl(item);
      if (hit) return hit;
    }
  }
  if (value && typeof value === "object") {
    for (const v of Object.values(value as Record<string, unknown>)) {
      const hit = firstHttpUrl(v);
      if (hit) return hit;
    }
  }
  return null;
}

function findUrlByHintKeys(row: InventarioAnyRow, hintKeys: string[]): string | null {
  const entries = Object.entries(row);
  for (const [key, value] of entries) {
    const k = normalize(key);
    if (!hintKeys.some((h) => k.includes(h))) continue;
    const hit = firstHttpUrl(value);
    if (hit) return hit;
  }
  return null;
}

function thumbnailCandidates(row: InventarioAnyRow): string[] {
  const candidates: string[] = [];
  for (const u of getInventarioStaticImageUrls(row)) {
    if (!candidates.includes(u)) candidates.push(u);
  }
  const preferred = preferredThumbnailUrl(row);
  if (preferred && !candidates.includes(preferred)) candidates.unshift(preferred);
  const hinted = findUrlByHintKeys(row, IMAGE_HINT_KEYS);
  if (hinted && !candidates.includes(hinted)) candidates.push(hinted);
  const fallback = firstHttpUrl(row);
  if (fallback && !candidates.includes(fallback)) candidates.push(fallback);
  return candidates;
}

function glo3dUrl(row: InventarioAnyRow): string | null {
  return firstGlo3dViewerUrl(row) ?? findUrlByHintKeys(row, GLO3D_HINT_KEYS);
}

type RawEntry = {
  key: string;
  path: string;
  value: unknown;
};

function normalizeKeyToken(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[\s\-.]+/g, "_")
    .trim();
}

function collectRawEntries(input: unknown, parentPath = ""): RawEntry[] {
  if (!input || typeof input !== "object" || Array.isArray(input)) return [];
  const source = input as Record<string, unknown>;
  const entries: RawEntry[] = [];
  for (const [rawKey, rawValue] of Object.entries(source)) {
    const key = normalizeKeyToken(rawKey);
    const path = parentPath ? `${parentPath}.${key}` : key;
    entries.push({ key, path, value: rawValue });
    if (rawValue && typeof rawValue === "object" && !Array.isArray(rawValue)) {
      entries.push(...collectRawEntries(rawValue, path));
    }
  }
  return entries;
}

function asDisplayValue(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "si" : "no";
  return null;
}

function getFirstRawValue(entries: RawEntry[], keys: string[]): string | null {
  const normalizedKeys = keys.map((key) => normalizeKeyToken(key));
  for (const alias of normalizedKeys) {
    const exact = entries.find((entry) => entry.path === alias || entry.key === alias);
    const exactValue = asDisplayValue(exact?.value);
    if (exactValue) return exactValue;
    const contains = entries.find((entry) => entry.path.includes(alias) || alias.includes(entry.key));
    const containsValue = asDisplayValue(contains?.value);
    if (containsValue) return containsValue;
  }
  return null;
}

function statusLabel(value: string | null, opts: { yes: string; no?: string }): string | null {
  if (!value) return null;
  const status = normalizeBinaryStatus(value);
  if (status === "yes") return opts.yes;
  if (status === "no") return opts.no ?? `SIN ${opts.yes}`;
  const cleaned = value.trim();
  return cleaned ? cleaned.toUpperCase() : null;
}

function normalizeMileage(value: string | null): string | null {
  if (!value) return null;
  const compact = value.trim();
  if (!compact) return null;
  const digits = compact.replace(/[^\d]/g, "");
  if (!digits) return compact;
  return `${Number(digits).toLocaleString("es-CL")} kms.`;
}

function normalizeBinaryStatus(value: string | null): "yes" | "no" | "unknown" | null {
  if (!value) return null;
  const normalized = value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (!normalized) return null;
  if (["si", "yes", "true", "1", "arranca", "se mueve", "se desplaza"].includes(normalized)) return "yes";
  if (["no", "false", "0", "no arranca", "no se mueve", "no se desplaza"].includes(normalized)) return "no";
  return "unknown";
}

function getMotorTestLabel(value: string | null): string | null {
  const status = normalizeBinaryStatus(value);
  if (!status) return null;
  if (status === "yes") return "MOTOR ARRANCA";
  if (status === "no") return "MOTOR NO ARRANCA";
  return value?.trim().toUpperCase() ?? null;
}

function getMovementTestLabel(value: string | null): string | null {
  const status = normalizeBinaryStatus(value);
  if (!status) return null;
  if (status === "yes") return "SE DESPLAZA";
  if (status === "no") return "NO SE DESPLAZA";
  return value?.trim().toUpperCase() ?? null;
}

function getVehicleSpecs(row: InventarioAnyRow): SearchSpec[] {
  const raw = row as Record<string, unknown>;
  const entries = collectRawEntries(raw);
  const mileage = normalizeMileage(
    getFirstRawValue(entries, ["kilometraje", "km", "kms", "odometro", "odómetro", "glo3d.kilometraje", "odometro_actual"]),
  );
  const year = getFirstRawValue(entries, ["ano", "anio", "year", "glo3d.year"]);
  const fuel = getFirstRawValue(entries, ["combustible", "fuel", "glo3d.combustible", "tipo_combustible"]);
  const transmission = getFirstRawValue(entries, [
    "transmision",
    "transmisión",
    "caja",
    "transmission",
    "glo3d.transmision",
    "tipo_caja",
  ]);
  const motorTestRaw = getFirstRawValue(entries, [
    "prueba_motor",
    "pdm",
    "pruebaMotor",
    "motor_test",
    "glo3d.prueba_motor",
    "motor_arranca",
    "arranca",
    "motor_funciona",
  ]);
  const movementTestRaw = getFirstRawValue(entries, [
    "prueba_desplazamiento",
    "pdd",
    "pruebaDesplazamiento",
    "movement_test",
    "glo3d.prueba_desplazamiento",
    "se_desplaza",
    "desplaza",
    "movimiento",
  ]);
  const conditionedRaw = getFirstRawValue(entries, ["condicionado", "glo3d.condicionado", "acondicionado"]);
  const singleOwnerRaw = getFirstRawValue(entries, [
    "unico_propietario",
    "single_owner",
    "one_owner",
    "glo3d.unico_propietario",
    "duenos",
    "dueno_unico",
  ]);
  const airConditioningRaw = getFirstRawValue(entries, [
    "aire_acondicionado",
    "air_conditioning",
    "has_ac",
    "ac",
    "glo3d.aire_acondicionado",
    "aire",
  ]);
  const keysRaw = getFirstRawValue(entries, [
    "llaves",
    "keys",
    "has_keys",
    "tiene_llaves",
    "glo3d.llaves",
    "con_llaves",
    "cantidad_llaves",
  ]);
  const tractionRaw = getFirstRawValue(entries, ["traccion", "traction", "glo3d.traccion", "traccion_4x4", "4x4"]);
  const airbagsRaw = getFirstRawValue(entries, ["estado_airbags", "airbags", "eda", "glo3d.estado_airbags", "airbag"]);
  const motorTest = getMotorTestLabel(motorTestRaw);
  const movementTest = getMovementTestLabel(movementTestRaw);
  const conditioned = statusLabel(conditionedRaw, { yes: "ACONDICIONADO", no: "NO ACONDICIONADO" });
  const singleOwner = statusLabel(singleOwnerRaw, { yes: "UNICO DUEÑO", no: "MULTIPLES DUEÑOS" });
  const airConditioning = statusLabel(airConditioningRaw, { yes: "AIRE ACONDICIONADO", no: "SIN AIRE ACONDICIONADO" });
  const keys = statusLabel(keysRaw, { yes: "CON LLAVES", no: "SIN LLAVES" });

  const specs: SearchSpec[] = [];
  if (mileage) specs.push({ key: "km", label: mileage, icon: "km" });
  if (year) specs.push({ key: "year", label: year, icon: "year" });
  if (fuel) specs.push({ key: "fuel", label: fuel.toUpperCase(), icon: "fuel" });
  if (transmission) specs.push({ key: "gear", label: transmission.toUpperCase(), icon: "gear" });
  if (motorTest) specs.push({ key: "engineTest", label: motorTest, icon: "engineTest", wide: true });
  if (movementTest) specs.push({ key: "movementTest", label: movementTest, icon: "movementTest", wide: true });
  if (conditioned) specs.push({ key: "conditioned", label: conditioned, icon: "conditioned", wide: true });
  if (singleOwner) specs.push({ key: "singleOwner", label: singleOwner, icon: "singleOwner", wide: true });
  if (airConditioning) specs.push({ key: "airConditioning", label: airConditioning, icon: "airConditioning", wide: true });
  if (keys) specs.push({ key: "keys", label: keys, icon: "keys", wide: true });
  if (tractionRaw) specs.push({ key: "traction", label: `TRACCION ${tractionRaw.toUpperCase()}`, icon: "traction", wide: true });
  if (airbagsRaw) specs.push({ key: "airbags", label: `AIRBAGS: ${airbagsRaw.toUpperCase()}`, icon: "airbags", wide: true });
  return specs.slice(0, 12);
}

function formatClpFromUnknown(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return `$${value.toLocaleString("es-CL")}`;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value.replace(/[^\d-]/g, ""));
    if (Number.isFinite(n)) return `$${n.toLocaleString("es-CL")}`;
  }
  return null;
}

function vehicleTitle(row: InventarioAnyRow): string {
  const marca = String(row.marca ?? "").trim();
  const modelo = String(row.modelo ?? "").trim();
  const version = String(row.version ?? "").trim();
  const ano = String(row.ano ?? "").trim();
  const text = [marca, modelo, version, ano].filter(Boolean).join(" ");
  return text ? `VEDISA Remates - ${text}` : "VEDISA Remates - Vehículo disponible";
}

function vehicleDescription(row: InventarioAnyRow): string {
  const descripcion = String(row.descripcion ?? "").replace(/\s+/g, " ").trim();
  if (descripcion) return descripcion.toUpperCase();
  const fallback = [String(row.marca ?? ""), String(row.modelo ?? "")].filter(Boolean).join(" ").trim();
  return fallback ? `${fallback.toUpperCase()} DISPONIBLE PARA OFERTAR` : "VEHÍCULO DISPONIBLE PARA OFERTAR";
}

function vehicleLotLabel(row: InventarioAnyRow): string | null {
  const lot = getFirstRawValue(collectRawEntries(row), ["csv_lote", "lote", "lot", "numero_lote"]);
  return lot ? `Lote ${lot}` : null;
}

function vehicleCategoryLabel(row: InventarioAnyRow): string | null {
  const cat = String(row.categoria ?? "").trim();
  if (!cat) return null;
  return `Categoría: ${cat}`;
}

function SpecIcon({ icon }: { icon: SpecIconName }) {
  if (icon === "km")
    return (
      <svg viewBox="0 0 20 20" className="h-4 w-4 text-[#7a624f]" fill="none" aria-hidden>
        <circle cx="10" cy="10" r="6.8" stroke="currentColor" strokeWidth="1.6" />
        <path d="M10 10 13.5 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="10" cy="10" r="1.1" fill="currentColor" />
      </svg>
    );
  if (icon === "year")
    return (
      <svg viewBox="0 0 20 20" className="h-4 w-4 text-[#7a624f]" fill="none" aria-hidden>
        <rect x="3.5" y="4.5" width="13" height="11.5" rx="1.8" stroke="currentColor" strokeWidth="1.6" />
        <path d="M6.5 3.5v2M13.5 3.5v2M3.5 8h13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  if (icon === "fuel")
    return (
      <svg viewBox="0 0 20 20" className="h-4 w-4 text-[#7a624f]" fill="none" aria-hidden>
        <path d="M4.5 4.5h6v11h-6z" stroke="currentColor" strokeWidth="1.6" />
        <path d="M10.5 7h1.8l1.4 1.6v4.4a1.7 1.7 0 0 0 3.4 0V9.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  if (icon === "engineTest")
    return (
      <svg viewBox="0 0 20 20" className="h-4 w-4 text-[#7a624f]" fill="none" aria-hidden>
        <rect x="3.5" y="7" width="9.8" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.6" />
        <path d="M13.3 8.4h2.2M13.3 11.6h2.2M6.4 7V5.4M10.4 7V5.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  if (icon === "movementTest")
    return (
      <svg viewBox="0 0 20 20" className="h-4 w-4 text-[#7a624f]" fill="none" aria-hidden>
        <path d="M4 10h9.8M10.8 6l3.5 4-3.5 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  if (icon === "conditioned")
    return (
      <svg viewBox="0 0 20 20" className="h-4 w-4 text-[#7a624f]" fill="none" aria-hidden>
        <path d="M4.2 10.2h11.6M10.5 4.4c2.8.2 5 2.5 5 5.3 0 2.9-2.3 5.3-5.3 5.3-2.8 0-5.1-2.2-5.3-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  if (icon === "singleOwner")
    return (
      <svg viewBox="0 0 20 20" className="h-4 w-4 text-[#7a624f]" fill="none" aria-hidden>
        <circle cx="10" cy="6.5" r="2.3" stroke="currentColor" strokeWidth="1.6" />
        <path d="M5 15.3c.6-2.1 2.5-3.6 5-3.6s4.4 1.5 5 3.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  if (icon === "airConditioning")
    return (
      <svg viewBox="0 0 20 20" className="h-4 w-4 text-[#7a624f]" fill="none" aria-hidden>
        <path d="M5 6.5h10M10 4.5v2M7.2 10.2l2.8-1.7 2.8 1.7M10 8.5V15.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  if (icon === "keys")
    return (
      <svg viewBox="0 0 20 20" className="h-4 w-4 text-[#7a624f]" fill="none" aria-hidden>
        <circle cx="7" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.6" />
        <path d="M9.5 10h6M13.5 10v1.8M15.5 10v1.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  if (icon === "traction")
    return (
      <svg viewBox="0 0 20 20" className="h-4 w-4 text-[#7a624f]" fill="none" aria-hidden>
        <circle cx="6" cy="14" r="1.7" stroke="currentColor" strokeWidth="1.6" />
        <circle cx="14" cy="14" r="1.7" stroke="currentColor" strokeWidth="1.6" />
        <path d="M5.5 12h9l-1-3.2H7.1L5.5 12Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
    );
  if (icon === "airbags")
    return (
      <svg viewBox="0 0 20 20" className="h-4 w-4 text-[#7a624f]" fill="none" aria-hidden>
        <circle cx="8.2" cy="7" r="2" stroke="currentColor" strokeWidth="1.6" />
        <path d="M4.8 14.8c.4-2 1.9-3.4 3.9-3.7M10.8 12.2h4.4M13 9.5v5.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  return null;
}

function SearchCardImage({ inventario }: { inventario: InventarioAnyRow }) {
  const candidates = useMemo(() => thumbnailCandidates(inventario), [inventario]);
  const sourceKey = `${String(inventario.id ?? "")}:${candidates.join("|")}`;
  const [state, setState] = useState<{ key: string; index: number }>({ key: sourceKey, index: 0 });
  const index = state.key === sourceKey ? state.index : 0;
  const src = candidates[index] ?? null;

  if (!src) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#15263a] to-[#0b1624] text-xs font-semibold text-slate-300">
        Sin miniatura
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={`${String(inventario.marca ?? "")} ${String(inventario.modelo ?? "")}`.trim() || "Vehiculo"}
      className="h-full w-full object-cover"
      loading="lazy"
      onError={() => {
        setState((prev) => {
          const nextIndex = prev.key === sourceKey ? prev.index + 1 : 1;
          return { key: sourceKey, index: nextIndex };
        });
      }}
    />
  );
}

const MAX_FETCH = 4000;
const MAX_RENDER = 12;
const REMATES_OFERTABLES = ["publicado", "en_curso"];

export function HeroInventorySearch({
  onSearchActiveChange,
}: {
  onSearchActiveChange?: (isActive: boolean) => void;
}) {
  const [q, setQ] = useState("");
  const [marca, setMarca] = useState("");
  const [categoria, setCategoria] = useState("");
  const [yearFrom, setYearFrom] = useState("");
  const [yearTo, setYearTo] = useState("");
  const [operativo, setOperativo] = useState<BoolFilter>("todos");
  const [motorArranca, setMotorArranca] = useState<BoolFilter>("todos");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [rows, setRows] = useState<SearchRow[]>([]);
  const [searched, setSearched] = useState(false);

  const visibleRows = useMemo(() => rows.slice(0, MAX_RENDER), [rows]);
  const hasAnyFilter =
    Boolean(q.trim()) ||
    Boolean(marca.trim()) ||
    Boolean(categoria.trim()) ||
    Boolean(yearFrom.trim()) ||
    Boolean(yearTo.trim()) ||
    operativo !== "todos" ||
    motorArranca !== "todos";

  useEffect(() => {
    onSearchActiveChange?.(hasAnyFilter);
  }, [hasAnyFilter, onSearchActiveChange]);

  const searchInventory = useCallback(async () => {
    setErr(null);
    setSearched(true);
    if (!hasAnyFilter) {
      setRows([]);
      return;
    }
    if (!isSupabaseConfigured()) {
      setErr("Búsqueda no disponible en este entorno.");
      setRows([]);
      return;
    }
    const sb = createClient();
    if (!sb) {
      setErr("Servicio de datos no disponible.");
      setRows([]);
      return;
    }

    setLoading(true);
    try {
      const searchToken = normalizeSearchToken(q);
      const { data, error } = await sb
        .from("portal_remate_lotes")
        .select(
          `
          id,
          inventario(*),
          portal_remates(id,estado,titulo,descripcion)
        `,
        )
        .order("created_at", { ascending: false })
        .limit(MAX_FETCH);
      if (error) {
        setErr("No se pudo consultar inventario. Intenta nuevamente.");
        setRows([]);
        return;
      }

      const byId = new Map<string, SearchRow>();
      for (const raw of ((data ?? []) as LoteJoinRow[])) {
        const remate = unwrapEmb(raw.portal_remates);
        const estado = normalize(remate?.estado);
        if (!REMATES_OFERTABLES.includes(estado)) continue;
        const inv = unwrapEmb(raw.inventario);
        if (!inv?.id) continue;
        const inventarioId = String(inv.id);
        if (!byId.has(inventarioId)) {
          byId.set(inventarioId, {
            inventario: inv,
            remateId: typeof remate?.id === "string" ? remate.id : null,
            remateEstado: estado || null,
          });
        }
      }

      let result = [...byId.values()];

      if (searchToken) result = result.filter((row) => rowMatchesText(row.inventario, searchToken));
      if (marca.trim()) result = result.filter((row) => normalize(row.inventario.marca).includes(normalize(marca)));
      if (categoria.trim()) result = result.filter((row) => normalize(row.inventario.categoria).includes(normalize(categoria)));
      if (yearFrom.trim()) {
        const minYear = Number(yearFrom);
        if (Number.isFinite(minYear)) {
          result = result.filter((row) => Number(row.inventario.ano ?? 0) >= minYear);
        }
      }
      if (yearTo.trim()) {
        const maxYear = Number(yearTo);
        if (Number.isFinite(maxYear)) {
          result = result.filter((row) => Number(row.inventario.ano ?? 0) <= maxYear);
        }
      }

      result = result.filter((row) =>
        rowMatchesBoolFilter(row.inventario, ["operativo", "es_operativo", "estado_operativo", "funciona"], operativo),
      );
      result = result.filter((row) =>
        rowMatchesBoolFilter(row.inventario, ["motor_arranca", "arranca", "motor_funciona"], motorArranca),
      );

      setRows(result);
    } finally {
      setLoading(false);
    }
  }, [categoria, hasAnyFilter, marca, motorArranca, operativo, q, yearFrom, yearTo]);

  useEffect(() => {
    if (!hasAnyFilter) return;
    const timer = window.setTimeout(() => {
      void searchInventory();
    }, 250);
    return () => window.clearTimeout(timer);
  }, [hasAnyFilter, searchInventory]);

  return (
    <section className="w-full border-b border-white/10 bg-[#0b1624]">
      <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-[#2a3a53] bg-gradient-to-b from-[#132235] to-[#101d2e] p-3 shadow-[0_20px_40px_-24px_rgba(0,0,0,0.8)]">
          <div className="flex flex-col gap-3 lg:flex-row">
            <div className="flex-1">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar por marca, patente, VIN, motor, modelo o cualquier dato del inventario..."
                className="h-12 w-full rounded-xl border border-[#365072] bg-[#0a1523] px-4 text-sm text-white placeholder:text-slate-400 focus:border-[#33C7E3] focus:outline-none"
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setFiltersOpen((v) => !v)}
                className="inline-flex h-12 items-center gap-2 rounded-xl border border-[#365072] bg-[#0a1523] px-4 text-sm font-semibold text-slate-200 hover:border-[#33C7E3]"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
                  <path strokeWidth="2" strokeLinecap="round" d="M4 6h16M7 12h10M10 18h4" />
                </svg>
                Filtros
              </button>
              <span className="inline-flex h-12 items-center rounded-xl border border-[#365072] bg-[#0a1523] px-4 text-xs font-semibold text-slate-300">
                {loading ? "Buscando..." : "Búsqueda automática"}
              </span>
            </div>
          </div>

          {filtersOpen ? (
            <div className="mt-3 grid gap-3 rounded-xl border border-[#2a3a53] bg-[#0b1624] p-3 md:grid-cols-3 lg:grid-cols-6">
              <input
                value={marca}
                onChange={(e) => setMarca(e.target.value)}
                placeholder="Marca"
                className="h-10 rounded-lg border border-[#365072] bg-[#0a1523] px-3 text-sm text-white placeholder:text-slate-400"
              />
              <input
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
                placeholder="Categoría"
                className="h-10 rounded-lg border border-[#365072] bg-[#0a1523] px-3 text-sm text-white placeholder:text-slate-400"
              />
              <input
                value={yearFrom}
                onChange={(e) => setYearFrom(e.target.value)}
                placeholder="Año desde"
                className="h-10 rounded-lg border border-[#365072] bg-[#0a1523] px-3 text-sm text-white placeholder:text-slate-400"
              />
              <input
                value={yearTo}
                onChange={(e) => setYearTo(e.target.value)}
                placeholder="Año hasta"
                className="h-10 rounded-lg border border-[#365072] bg-[#0a1523] px-3 text-sm text-white placeholder:text-slate-400"
              />
              <select
                value={motorArranca}
                onChange={(e) => setMotorArranca(e.target.value as BoolFilter)}
                className="h-10 rounded-lg border border-[#365072] bg-[#0a1523] px-3 text-sm text-white"
              >
                <option value="todos">Motor arranca: todos</option>
                <option value="si">Motor arranca: sí</option>
                <option value="no">Motor arranca: no</option>
              </select>
              <select
                value={operativo}
                onChange={(e) => setOperativo(e.target.value as BoolFilter)}
                className="h-10 rounded-lg border border-[#365072] bg-[#0a1523] px-3 text-sm text-white"
              >
                <option value="todos">Operativo: todos</option>
                <option value="si">Operativo: sí</option>
                <option value="no">Operativo: no</option>
              </select>
            </div>
          ) : null}

          {err ? <p className="mt-3 text-sm text-red-300">{err}</p> : null}
          {hasAnyFilter && searched && !loading ? (
            <p className="mt-3 text-xs text-slate-400">
              Resultados: {rows.length} {rows.length === 1 ? "vehículo" : "vehículos"}.
              {rows.length > MAX_RENDER ? ` Mostrando los primeros ${MAX_RENDER}.` : ""}
            </p>
          ) : null}

          {hasAnyFilter && searched && !loading && !visibleRows.length ? (
            <div className="mt-4 rounded-xl border border-dashed border-[#365072] bg-[#0a1523] px-4 py-8 text-center">
              <p className="text-sm font-semibold text-slate-200">No encontramos vehiculos con esos filtros.</p>
              <p className="mt-1 text-xs text-slate-400">Prueba otra marca, patente o un rango de anio mas amplio.</p>
            </div>
          ) : null}

          {visibleRows.length ? (
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {visibleRows.map((row) => {
                const specs = getVehicleSpecs(row.inventario);
                const lotLabel = vehicleLotLabel(row.inventario);
                const categoryLabel = vehicleCategoryLabel(row.inventario);
                const priceLabel = formatClpFromUnknown(row.inventario.precio_minimo_remate ?? row.inventario.valor_minimo);
                const glo3d = glo3dUrl(row.inventario);

                return (
                  <article
                    key={String(row.inventario.id)}
                    className="overflow-hidden rounded-xl border border-[#dfd4c7] bg-[#fcfaf7] text-left shadow-[0_8px_18px_rgba(73,46,26,0.12)]"
                  >
                    <div className="relative aspect-[16/9] w-full overflow-hidden border-b border-[#dfd4c7]">
                      <SearchCardImage inventario={row.inventario} />
                      {glo3d ? (
                        <a
                          href={glo3d}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="absolute right-2 top-2 rounded-md bg-[#6fd0ef] px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-[#0f1f2c]"
                        >
                          Glo3D
                        </a>
                      ) : null}
                    </div>

                    <div className="space-y-2.5 p-3">
                      <h3 className="line-clamp-2 text-[0.98rem] font-extrabold tracking-tight text-[#2f1f14]">{vehicleTitle(row.inventario)}</h3>
                      <p className="line-clamp-2 text-[0.82rem] text-[#6c5440]">{vehicleDescription(row.inventario)}</p>

                      {specs.length > 0 ? (
                        <div className="rounded-lg border border-amber-200/70 bg-[#fdfaf5] p-2.5">
                          <div className="grid grid-cols-2 gap-x-2.5 gap-y-1.5 text-xs text-[#4f5a66]">
                            {specs.map((spec) => (
                              <div key={spec.key} className={`flex items-center gap-2 ${spec.wide ? "col-span-2" : ""}`}>
                                <SpecIcon icon={spec.icon} />
                                <span className={`${spec.wide ? "text-[0.7rem] font-semibold uppercase leading-tight" : "truncate"} text-[#5a616d]`}>
                                  {spec.label}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      <div className="flex flex-wrap gap-1.5 text-[11px] text-[#604734]">
                        {lotLabel ? <span className="rounded-full border border-amber-300/60 bg-[#f4ebe2] px-2.5 py-1">{lotLabel}</span> : null}
                        {categoryLabel ? (
                          <span className="rounded-full border border-amber-300/70 bg-[#eddccf] px-2.5 py-1 font-semibold">{categoryLabel}</span>
                        ) : null}
                      </div>

                      {priceLabel ? (
                        <div className="border-t border-amber-200/70 pt-2.5">
                          <p className="text-[1.45rem] font-extrabold tracking-tight text-[#673b1f]">{priceLabel}</p>
                        </div>
                      ) : null}

                      {row.remateId ? (
                        <Link
                          href={`/subastas/${row.remateId}`}
                          className="inline-flex w-full items-center justify-center rounded-lg bg-[#66cceb] px-3 py-2 text-xs font-bold text-[#0f1f2c] transition hover:brightness-105"
                        >
                          Ir a ofertar
                        </Link>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

