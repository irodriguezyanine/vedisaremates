/**
 * Subida no firmada a Cloudinary. En tiempo de compilación Next inyecta
 * `NEXT_PUBLIC_CLOUDINARY_*` desde `next.config.ts` (también aceptando `VITE_CLOUDINARY_*` en el entorno).
 */

export type CloudinaryConfig = {
  cloudName: string | undefined;
  uploadPreset: string | undefined;
  configured: boolean;
};

type UploadImageOptions = {
  folder?: string;
};

export function getPublicCloudinaryConfig(): CloudinaryConfig {
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const uploadPreset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;
  return {
    cloudName,
    uploadPreset,
    configured: Boolean(cloudName?.trim() && uploadPreset?.trim()),
  };
}

export async function uploadImageToCloudinary(
  file: File,
  options?: UploadImageOptions,
): Promise<{ secureUrl: string } | { error: string }> {
  const { cloudName, uploadPreset, configured } = getPublicCloudinaryConfig();
  if (!configured || !cloudName || !uploadPreset) {
    return { error: "Cloudinary no está configurado en el proyecto (cloud name y upload preset públicos)." };
  }
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", uploadPreset);
  formData.append("folder", options?.folder?.trim() || "vedisa/home-hero");

  try {
    const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
      method: "POST",
      body: formData,
    });
    const data = (await res.json()) as { secure_url?: string; error?: { message?: string } };
    if (!res.ok) {
      return { error: data.error?.message ?? `Error Cloudinary (${res.status})` };
    }
    if (!data.secure_url?.trim()) {
      return { error: "Respuesta de Cloudinary sin URL." };
    }
    return { secureUrl: data.secure_url.trim() };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error de red.";
    return { error: msg };
  }
}
