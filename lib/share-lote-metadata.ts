import type { Metadata } from "next";

import { getInventarioStaticImageUrls, preferredThumbnailUrl } from "@/lib/inventario-media";
import type { InventarioRow } from "@/lib/portal-types";
import { getInventarioField } from "@/lib/vehicle-spec-summary";

type InventarioAny = InventarioRow & Record<string, unknown>;

function hashSeed(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i += 1) h = (h + value.charCodeAt(i) * (i + 1)) % 9973;
  return h;
}

function tituloVehiculo(inv: InventarioAny | null, loteTitulo?: string | null): string {
  if (!inv) return loteTitulo?.trim() || "Vehículo en remate";
  const marca = String(inv.marca ?? "").trim();
  const modelo = String(inv.modelo ?? "").trim();
  const version = String(inv.version ?? "").trim();
  const core = [marca, modelo, version].filter(Boolean).join(" ");
  if (core) return core;
  return loteTitulo?.trim() || "Vehículo en remate";
}

function extrasVehiculo(inv: InventarioAny | null): string {
  if (!inv) return "";
  const parts: string[] = [];
  const ano = String(inv.ano ?? inv.anio ?? "").trim();
  if (ano) parts.push(`año ${ano}`);
  const patente = String(inv.patente ?? "").trim();
  if (patente) parts.push(`patente ${patente}`);
  const kmRaw =
    String(inv.kilometraje ?? "").trim() ||
    getInventarioField(inv, ["kilometraje", "km", "mileage"]) ||
    "";
  const kmDigits = kmRaw.replace(/[^\d]/g, "");
  if (kmDigits) {
    const km = Number(kmDigits).toLocaleString("es-CL");
    parts.push(`${km} km`);
  }
  return parts.length ? ` (${parts.join(" · ")})` : "";
}

/** Textos distintos por lote (semilla = id del lote). */
function descripcionCompartirLote(vehiculo: string, extras: string, seed: string): string {
  const variantes = [
    `Revisa la unidad ${vehiculo}${extras}. Puja en línea en VEDISA Remates.`,
    `${vehiculo}${extras}: disponible en remate Vedisa. Mira fotos, ficha técnica y oferta actual.`,
    `¿Te interesa ${vehiculo}${extras}? Está en remate en VEDISA. Entra al enlace y revisa el detalle.`,
    `Oportunidad en remate: ${vehiculo}${extras}. Consulta el lote y participa desde VEDISA Remates.`,
    `Descubre ${vehiculo}${extras} en subasta Vedisa. Información del vehículo y pujas en un solo lugar.`,
  ];
  return variantes[hashSeed(seed) % variantes.length];
}

export function resolveLoteShareOgImage(inv: InventarioAny | null, siteUrl: string): string | undefined {
  if (!inv) return undefined;
  const preferred = preferredThumbnailUrl(inv);
  const candidates = getInventarioStaticImageUrls(inv);
  const raw = preferred ?? candidates[0] ?? null;
  if (!raw) return undefined;
  if (/^https?:\/\//i.test(raw)) return raw;
  try {
    return new URL(raw, siteUrl).toString();
  } catch {
    return undefined;
  }
}

export function buildLoteShareMetadata(input: {
  remateTitulo: string;
  loteId: string;
  loteTitulo?: string | null;
  inventario: InventarioAny | null;
  canonicalPath: string;
  siteUrl: string;
}): Pick<Metadata, "title" | "description" | "openGraph" | "twitter"> {
  const vehiculo = tituloVehiculo(input.inventario, input.loteTitulo);
  const extras = extrasVehiculo(input.inventario);
  const description = descripcionCompartirLote(vehiculo, extras, input.loteId);
  const title = `${vehiculo} en remate`;
  const pageUrl = new URL(input.canonicalPath, input.siteUrl).toString();
  const image = resolveLoteShareOgImage(input.inventario, input.siteUrl);

  const openGraphImages = image ? [{ url: image, alt: vehiculo }] : undefined;

  return {
    title: { absolute: `${title} · VEDISA Remates` },
    description,
    openGraph: {
      title,
      description,
      url: pageUrl,
      type: "website",
      locale: "es_CL",
      siteName: "VEDISA Remates",
      images: openGraphImages,
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description,
      images: image ? [image] : undefined,
    },
  };
}

export function buildRemateShareMetadata(input: {
  remateTitulo: string;
  canonicalPath: string;
  siteUrl: string;
}): Pick<Metadata, "title" | "description" | "openGraph" | "twitter"> {
  const titulo = input.remateTitulo.trim() || "Remate Vedisa";
  const description = `Sala de remate «${titulo}». Revisa lotes, fotos y ofertas en VEDISA Remates.`;
  const pageUrl = new URL(input.canonicalPath, input.siteUrl).toString();
  return {
    title: { absolute: `${titulo} · VEDISA Remates` },
    description,
    openGraph: {
      title: titulo,
      description,
      url: pageUrl,
      type: "website",
      locale: "es_CL",
      siteName: "VEDISA Remates",
    },
    twitter: {
      card: "summary",
      title: titulo,
      description,
    },
  };
}
