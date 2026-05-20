/**
 * Consulta Autored (misma lógica que Edge `autored-vehicle-info` en TasacionesVedisa1).
 * Solo servidor: usa AUTORED_EMAIL / AUTORED_PASSWORD.
 */

const AUTORED_BASE = "https://app.autored.cl/api/v2";
const AUTORED_V1_SUGGESTED_PRICE = "https://app.autored.cl/api/v1/suggested_price";

export type AutoredVehicleInfo = {
  marca: string | null;
  modelo: string | null;
  ano: string | null;
  version: string | null;
  color: string | null;
  numero_motor: string | null;
  numero_chasis: string | null;
  precio_retoma: number | null;
  precio_publicacion: number | null;
  precio_vedisa: number | null;
};

type AuthResponse = {
  accessToken?: string;
};

function asStringOrEmpty(val: unknown): string | null {
  if (val == null) return null;
  const s = String(val).trim();
  return s.length > 0 ? s : null;
}

function asNumber(val: unknown): number | null {
  if (val == null) return null;
  if (typeof val === "number" && Number.isFinite(val)) return val;
  const n = Number(String(val).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function findPriceInObject(obj: unknown, keys: string[]): number | null {
  if (obj == null || typeof obj !== "object") return null;
  const rec = obj as Record<string, unknown>;
  const keySet = new Set(keys.map((k) => k.toLowerCase()));
  for (const [k, v] of Object.entries(rec)) {
    const kLower = k.toLowerCase();
    if (keySet.has(kLower)) {
      const n = asNumber(v);
      if (n != null && n > 0) return n;
    }
    if (v != null && typeof v === "object" && !Array.isArray(v)) {
      const nested = findPriceInObject(v, keys);
      if (nested != null) return nested;
    }
  }
  return null;
}

async function obtenerTokenAutored(): Promise<string | null> {
  const email = process.env.AUTORED_EMAIL?.trim();
  const password = process.env.AUTORED_PASSWORD?.trim();
  if (!email || !password) return null;

  const res = await fetch(`${AUTORED_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
    cache: "no-store",
  });
  if (!res.ok) return null;
  const data = (await res.json()) as AuthResponse;
  return data.accessToken ?? null;
}

export type FetchAutoredOpts = {
  licensePlate: string;
  /** Kilometraje numérico (opcional, para suggested_price). */
  kilometraje?: number | null;
};

export type FetchAutoredResult =
  | { ok: true; data: AutoredVehicleInfo }
  | { ok: false; status: number; error: string };

export async function fetchAutoredVehicleInfoServer(opts: FetchAutoredOpts): Promise<FetchAutoredResult> {
  const licensePlate = opts.licensePlate.replace(/[\s.\-·]/g, "").toUpperCase();
  if (licensePlate.length < 5) {
    return { ok: false, status: 400, error: "Patente inválida" };
  }

  const token = await obtenerTokenAutored();
  if (!token) {
    return { ok: false, status: 503, error: "Autored no configurado en el servidor" };
  }

  try {
    const infoRes = await fetch(
      `${AUTORED_BASE}/Vehicles/info?licensePlate=${encodeURIComponent(licensePlate)}`,
      {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        cache: "no-store",
      },
    );

    if (!infoRes.ok) {
      if (infoRes.status === 403) {
        const body = await infoRes.text();
        if (body.includes("banned")) {
          return { ok: false, status: 429, error: "Autored: demasiadas solicitudes, intente más tarde" };
        }
      }
      return { ok: false, status: 404, error: "Autored: no se encontró información para esta patente" };
    }

    let data = (await infoRes.json()) as Record<string, unknown>;
    const inner = (data.data ?? data.vehicle ?? data.result) as Record<string, unknown> | undefined;
    if (inner && typeof inner === "object") {
      data = { ...data, ...inner };
    }

    let precioRetoma = findPriceInObject(data, [
      "retake_price",
      "retoma_price",
      "precio_retoma",
      "retake",
      "retoma",
    ]);
    let precioPublicacion = findPriceInObject(data, [
      "publication_price",
      "precio_publicacion",
      "publication",
      "suggested_price",
    ]);
    let precioVedisa = findPriceInObject(data, [
      "suggested_business_price",
      "suggestedBusinessPrice",
      "precio_vedisa",
    ]);

    const brandId = asNumber(data.brand_id) ?? asNumber(data.brandId);
    const modelId = asNumber(data.model_id) ?? asNumber(data.modelId);
    const versionId = asNumber(data.version_id) ?? asNumber(data.versionId);
    const requestId = asNumber(data.request_id) ?? asNumber(data.requestId);
    const year = asNumber(data.year) ?? asNumber(data.manufacture_year);

    if (
      (!precioRetoma || !precioPublicacion) &&
      brandId != null &&
      modelId != null &&
      versionId != null &&
      requestId != null &&
      year != null
    ) {
      const formData = new FormData();
      formData.append("brand_id", String(brandId));
      formData.append("model_id", String(modelId));
      formData.append("version_id", String(versionId));
      formData.append("request_id", String(requestId));
      formData.append("year", String(year));
      if (opts.kilometraje != null && opts.kilometraje > 0) {
        const km = String(Math.round(opts.kilometraje));
        formData.append("mileage", km);
        formData.append("kilometers", km);
        formData.append("kilometraje", km);
        formData.append("km", km);
      }

      const email = process.env.AUTORED_EMAIL?.trim() ?? "";
      const password = process.env.AUTORED_PASSWORD?.trim() ?? "";
      const priceRes = await fetch(AUTORED_V1_SUGGESTED_PRICE, {
        method: "POST",
        headers: { Accept: "application/json", email, token: password },
        body: formData,
        cache: "no-store",
      });

      if (priceRes.ok) {
        const priceData = (await priceRes.json()) as Record<string, unknown>;
        const pub = priceData.publication as Record<string, unknown> | undefined;
        const retake = (priceData.retake ?? priceData.retoma) as Record<string, unknown> | undefined;

        if (pub && precioPublicacion == null) {
          const suggested = asNumber(pub.suggested_price ?? pub.suggestedPrice ?? pub.precio);
          if (suggested != null) precioPublicacion = suggested;
        }
        if (precioRetoma == null) {
          precioRetoma =
            asNumber(priceData.retake_price ?? priceData.retakePrice) ??
            asNumber(priceData.retoma_price ?? priceData.precio_retoma);
        }
        if (retake && precioRetoma == null) {
          const retomaVal = asNumber(
            retake.suggested_price ??
              retake.suggestedPrice ??
              retake.retake_price ??
              retake.retakePrice ??
              retake.precio ??
              retake.value,
          );
          if (retomaVal != null) precioRetoma = retomaVal;
        }
        if (precioVedisa == null && retake) {
          precioVedisa = asNumber(retake.suggested_business_price ?? retake.suggestedBusinessPrice);
        }
        if (precioVedisa == null && pub) {
          precioVedisa = asNumber(pub.suggested_business_price ?? pub.suggestedBusinessPrice);
        }
      }
    }

    return {
      ok: true,
      data: {
        marca: asStringOrEmpty(data.brand_name),
        modelo: asStringOrEmpty(data.model_name ?? data.original_model_name),
        ano: data.year != null ? String(data.year) : null,
        version: asStringOrEmpty(data.version_name ?? data.original_extracted_version),
        color: asStringOrEmpty(data.color),
        numero_motor: asStringOrEmpty(data.engine_number ?? data.engineNumber ?? data.ndm),
        numero_chasis: asStringOrEmpty(data.vin ?? data.extracted_vin ?? data.n_de_vin ?? data.ndc),
        precio_retoma: precioRetoma,
        precio_publicacion: precioPublicacion,
        precio_vedisa: precioVedisa,
      },
    };
  } catch (err) {
    const rawMsg = err instanceof Error ? err.message : String(err ?? "");
    const esRed = /failed to fetch|network|timeout|econnrefused/i.test(rawMsg);
    return {
      ok: false,
      status: 500,
      error: esRed
        ? "No se pudo conectar con Autored. Intenta más tarde."
        : rawMsg || "Error al consultar Autored",
    };
  }
}
