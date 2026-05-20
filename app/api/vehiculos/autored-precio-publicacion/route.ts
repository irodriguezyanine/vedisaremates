import { NextResponse } from "next/server";

import { fetchAutoredVehicleInfoServer } from "@/lib/autored/fetch-vehicle-info.server";
import { extraerKilometrajeNumerico, normalizarPatenteParaAutored } from "@/lib/autored/extract-inventario";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const patente = normalizarPatenteParaAutored(url.searchParams.get("patente") ?? "");
  const kilometrajeParam = url.searchParams.get("kilometraje") ?? url.searchParams.get("km") ?? "";
  const kilometraje = extraerKilometrajeNumerico(kilometrajeParam);

  if (patente.length < 5) {
    return NextResponse.json({ error: "Patente requerida (mínimo 5 caracteres)" }, { status: 400 });
  }

  const result = await fetchAutoredVehicleInfoServer({
    licensePlate: patente,
    kilometraje,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const versionQuery = url.searchParams.get("version")?.trim() || null;

  return NextResponse.json({
    patente,
    version: versionQuery ?? result.data.version,
    kilometraje: kilometraje,
    precio_publicacion: result.data.precio_publicacion,
    precio_retoma: result.data.precio_retoma,
    precio_vedisa: result.data.precio_vedisa,
    marca: result.data.marca,
    modelo: result.data.modelo,
    ano: result.data.ano,
  });
}
