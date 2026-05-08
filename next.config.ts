import type { NextConfig } from "next";
import path from "node:path";

/** Next solo expone al cliente vars `NEXT_PUBLIC_*`. Permitimos mismos valores que Vite usa (`VITE_SUPABASE_*`). */
const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
const supabaseAnon =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? "";

/** Subida hero en admin: permite vars Vite legacy en Vercel (`VITE_CLOUDINARY_*`) además de `NEXT_PUBLIC_*`. */
const cloudinaryCloud =
  process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ??
  process.env.VITE_CLOUDINARY_CLOUD_NAME ??
  "";
const cloudinaryPreset =
  process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET ??
  process.env.VITE_CLOUDINARY_UPLOAD_PRESET ??
  "";
const cloudinaryPresetRaw =
  process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET_RAW ??
  process.env.VITE_CLOUDINARY_UPLOAD_PRESET_RAW ??
  "";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname),
  },
  env: {
    NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: supabaseAnon,
    NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: cloudinaryCloud,
    NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET: cloudinaryPreset,
    NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET_RAW: cloudinaryPresetRaw,
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "res.cloudinary.com", pathname: "/**" },
      { protocol: "https", hostname: "img.icons8.com", pathname: "/**" },
      { protocol: "https", hostname: "static.vecteezy.com", pathname: "/**" },
      { protocol: "https", hostname: "cdn-icons-png.flaticon.com", pathname: "/**" },
      { protocol: "https", hostname: "**.supabase.co", pathname: "/storage/v1/object/public/**" },
    ],
  },
};

export default nextConfig;
