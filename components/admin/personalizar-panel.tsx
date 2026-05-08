"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";

import { getPublicCloudinaryConfig, uploadImageToCloudinary } from "@/lib/cloudinary-upload";
import {
  HERO_CAROUSEL_SLOT_COUNT,
  FALLBACK_HERO_SLIDES,
  coerceHeroSlides,
  sanitizeSlidesForSave,
  slidesForAdminForm,
  type HeroSlide,
} from "@/lib/hero-slides-shared";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/public-env";

export function PersonalizarPanel() {
  const cld = getPublicCloudinaryConfig();

  const [slides, setSlides] = useState<HeroSlide[]>(() =>
    slidesForAdminForm([...FALLBACK_HERO_SLIDES]),
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [uploadIx, setUploadIx] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    if (!isSupabaseConfigured()) {
      setErr("Supabase no está configurado.");
      setLoading(false);
      return;
    }
    const sb = createClient();
    if (!sb) {
      setErr("Cliente de datos no disponible.");
      setLoading(false);
      return;
    }
    const { data, error } = await sb.from("portal_home_hero").select("slides").eq("id", 1).maybeSingle();
    if (error) {
      setErr(error.message);
      setSlides(slidesForAdminForm([...FALLBACK_HERO_SLIDES]));
      setLoading(false);
      return;
    }
    const stored = coerceHeroSlides(data?.slides ?? null);
    setSlides(
      slidesForAdminForm(
        stored?.length ? [...stored.slice(0, HERO_CAROUSEL_SLOT_COUNT)] : [...FALLBACK_HERO_SLIDES],
      ),
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, [load]);

  function update(ix: number, patch: Partial<HeroSlide>) {
    setSlides((prev) =>
      prev.map((s, i) => (i === ix ? { ...s, ...patch } : { ...s })),
    );
    setOk(null);
  }

  async function save() {
    setSaving(true);
    setErr(null);
    setOk(null);
    const sb = createClient();
    if (!sb) {
      setErr("Servicio no disponible.");
      setSaving(false);
      return;
    }
    const clean = sanitizeSlidesForSave(slides);
    if (clean.length !== HERO_CAROUSEL_SLOT_COUNT) {
      setErr(`Se requieren ${HERO_CAROUSEL_SLOT_COUNT} imágenes con URL válida (https).`);
      setSaving(false);
      return;
    }

    const { error } = await sb.from("portal_home_hero").upsert({ id: 1, slides: clean }, { onConflict: "id" });
    if (error) {
      setErr(error.message);
      setSaving(false);
      return;
    }
    setOk("Cambios guardados correctamente.");
    setSaving(false);
  }

  async function onPickFile(ix: number, file: File | null) {
    if (!file) return;
    setUploadIx(ix);
    setErr(null);
    const up = await uploadImageToCloudinary(file);
    setUploadIx(null);
    if ("error" in up) {
      setErr(up.error);
      return;
    }
    update(ix, { src: up.secureUrl });
    setOk("Imagen subida — recuerda guardar cambios.");
  }

  const missingSql =
    err?.includes("portal_home_hero") ||
    err?.includes("permission denied") ||
    err?.includes("relation") ||
    err?.includes("does not exist");

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Personalizar</h1>
      </div>

      {err ? (
        <p className={`rounded-lg border px-4 py-3 text-sm ${missingSql ? "border-amber-500/50 bg-amber-950/30 text-amber-100" : "border-red-500/40 bg-red-950/20 text-red-200"}`}>
          {err}
          {missingSql ? (
            <span className="mt-2 block">
              ¿Falta la tabla? Ejecutá en Supabase el script{" "}
              <strong className="font-semibold">supabase/migrations/portal_home_hero_carousel.sql</strong>.
            </span>
          ) : null}
        </p>
      ) : null}
      {ok ? <p className="rounded-lg border border-emerald-500/35 bg-emerald-950/20 px-4 py-3 text-sm text-emerald-100">{ok}</p> : null}

      {loading ? (
        <p className="text-neutral-400">Cargando…</p>
      ) : (
        <>
          <ul className="space-y-8">
            {slides.map((s, ix) => (
              <li
                key={ix}
                className="rounded-xl border border-white/10 bg-[#141c28] p-5"
              >
                <p className="text-sm font-semibold text-white">Banner {ix + 1}</p>
                <div className="mt-4 flex flex-col gap-4 lg:flex-row">
                  <div className="relative h-44 w-full max-w-xl shrink-0 overflow-hidden rounded-lg border border-white/10 bg-black/40">
                    {/^https:\/\//i.test(s.src) ? (
                      <Image
                        src={s.src}
                        alt={s.alt || `Banner ${ix + 1}`}
                        fill
                        className="object-contain"
                        sizes="(max-width: 768px) 100vw, 640px"
                        unoptimized
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-sm text-neutral-500">Sin vista previa</div>
                    )}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-3">
                    <label className="block text-xs text-neutral-400">
                      URL de imagen (https)
                      <input
                        value={s.src}
                        onChange={(e) => update(ix, { src: e.target.value })}
                        className="mt-1 w-full rounded border border-white/15 bg-black/35 px-3 py-2 text-sm text-white"
                        placeholder="https://..."
                      />
                    </label>
                    <label className="block text-xs text-neutral-400">
                      Destino al hacer clic (ruta interna recomendada, ej. / o /subastas)
                      <input
                        value={s.href}
                        onChange={(e) => update(ix, { href: e.target.value })}
                        className="mt-1 w-full rounded border border-white/15 bg-black/35 px-3 py-2 text-sm text-white"
                        placeholder="/"
                      />
                    </label>
                    <label className="block text-xs text-neutral-400">
                      Texto alternativo (accesibilidad)
                      <input
                        value={s.alt}
                        onChange={(e) => update(ix, { alt: e.target.value })}
                        className="mt-1 w-full rounded border border-white/15 bg-black/35 px-3 py-2 text-sm text-white"
                      />
                    </label>
                    <div>
                      <input
                        type="file"
                        accept="image/*"
                        disabled={uploadIx === ix || !cld.configured}
                        id={`hero-upload-${ix}`}
                        className="hidden"
                        onChange={(e) => void onPickFile(ix, e.target.files?.[0] ?? null)}
                      />
                      <label
                        htmlFor={`hero-upload-${ix}`}
                        className={`inline-flex cursor-pointer rounded-lg border px-4 py-2 text-sm font-semibold transition ${
                          cld.configured
                            ? "border-[#33C7E3]/50 text-[#33C7E3] hover:bg-[#33C7E3]/10"
                            : "cursor-not-allowed border-white/15 text-neutral-500"
                        }`}
                      >
                        {uploadIx === ix ? "Subiendo…" : "Subir desde tu equipo (Cloudinary)"}
                      </label>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={saving}
              onClick={() => void save()}
              className="rounded-lg bg-[#33C7E3] px-6 py-2.5 text-sm font-bold text-[#0f1f2c] disabled:opacity-50"
            >
              {saving ? "Guardando…" : "Guardar carrusel"}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => {
                setSlides(slidesForAdminForm([...FALLBACK_HERO_SLIDES]));
                setOk(null);
                setErr(null);
              }}
              className="rounded-lg border border-white/20 px-4 py-2.5 text-sm text-neutral-200 hover:bg-white/5"
            >
              Rellenar con portadas incluidas (borrador local)
            </button>
          </div>
        </>
      )}
    </div>
  );
}
