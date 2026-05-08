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
import {
  PORTAL_BANNER_ADMIN_DEFS,
  collectAdminInventoryPresetRows,
  defaultFichaSectionOrderTitles,
  normalizeMapKey,
} from "@/lib/inventario-ficha";
import type { PortalFichaFieldOverride } from "@/lib/portal-ficha-config";
import { parsePortalInventarioFichaConfig } from "@/lib/portal-ficha-config";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/public-env";

const INV_FICHA_PRESETS = collectAdminInventoryPresetRows();
const PORTAL_KEY_SET = new Set(PORTAL_BANNER_ADMIN_DEFS.map((d) => d.key));
const INVENTORY_PRESET_KEY_SET = new Set(INV_FICHA_PRESETS.map((p) => p.sourceKeyHint));

function pruneFieldOverrides(raw: Record<string, PortalFichaFieldOverride>): Record<string, PortalFichaFieldOverride> {
  const out: Record<string, PortalFichaFieldOverride> = {};
  for (const [k, v] of Object.entries(raw)) {
    const keyTrim = k.trim();
    if (!keyTrim) continue;
    const t: PortalFichaFieldOverride = {};
    if (typeof v.label === "string" && v.label.trim()) t.label = v.label.trim().slice(0, 320);
    if (typeof v.visible === "boolean") t.visible = v.visible;
    if (typeof v.order === "number" && Number.isFinite(v.order)) t.order = Math.round(v.order);
    if (typeof v.sectionTitle === "string" && v.sectionTitle.trim()) t.sectionTitle = v.sectionTitle.trim().slice(0, 240);
    if (Object.keys(t).length) out[keyTrim] = t;
  }
  return out;
}

function isEmptyOverrideEntry(c: PortalFichaFieldOverride): boolean {
  return (
    c.visible === undefined &&
    !(typeof c.label === "string" && c.label.trim()) &&
    !(typeof c.sectionTitle === "string" && c.sectionTitle.trim()) &&
    !(typeof c.order === "number" && Number.isFinite(c.order))
  );
}

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
  const [fichaOverrides, setFichaOverrides] = useState<Record<string, PortalFichaFieldOverride>>({});
  const [fichaSectionOrder, setFichaSectionOrder] = useState("");
  const [fichaSaving, setFichaSaving] = useState(false);
  const [fichaOk, setFichaOk] = useState<string | null>(null);
  const [fichaErr, setFichaErr] = useState<string | null>(null);
  const [fichaLoadErr, setFichaLoadErr] = useState<string | null>(null);
  const [customKeyInput, setCustomKeyInput] = useState("");
  const [customLabelDraft, setCustomLabelDraft] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    setFichaLoadErr(null);
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
    const [heroRes, fichaRes] = await Promise.all([
      sb.from("portal_home_hero").select("slides").eq("id", 1).maybeSingle(),
      sb.from("portal_inventario_ficha_config").select("config").eq("id", 1).maybeSingle(),
    ]);
    if (heroRes.error) {
      setErr(heroRes.error.message);
      setSlides(slidesForAdminForm([...FALLBACK_HERO_SLIDES]));
    } else {
      const stored = coerceHeroSlides(heroRes.data?.slides ?? null);
      setSlides(
        slidesForAdminForm(
          stored?.length ? [...stored.slice(0, HERO_CAROUSEL_SLOT_COUNT)] : [...FALLBACK_HERO_SLIDES],
        ),
      );
    }

    if (fichaRes.error) {
      setFichaLoadErr(fichaRes.error.message);
      setFichaOverrides({});
      setFichaSectionOrder([...defaultFichaSectionOrderTitles()].join("\n"));
    } else {
      const cfg = parsePortalInventarioFichaConfig(fichaRes.data?.config ?? null);
      setFichaOverrides(cfg?.fieldOverrides ? { ...cfg.fieldOverrides } : {});
      const orderTitles = cfg?.sectionOrder?.length ? cfg.sectionOrder : [...defaultFichaSectionOrderTitles()];
      setFichaSectionOrder(orderTitles.join("\n"));
      setFichaLoadErr(null);
    }

    if (heroRes.error) {
      setLoading(false);
      return;
    }
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

  const missingFichaSql =
    fichaLoadErr?.includes("portal_inventario_ficha_config") ||
    fichaErr?.includes("portal_inventario_ficha_config") ||
    (fichaLoadErr &&
      (/permission denied/i.test(fichaLoadErr) || /does not exist/i.test(fichaLoadErr) || /relation/i.test(fichaLoadErr)));

  function setVisibilityMode(key: string, mode: "def" | "show" | "hide") {
    setFichaOk(null);
    setFichaOverrides((prev) => {
      const next = { ...prev };
      const cur: PortalFichaFieldOverride = { ...(next[key] ?? {}) };
      if (mode === "def") delete cur.visible;
      else cur.visible = mode === "show";

      if (isEmptyOverrideEntry(cur)) delete next[key];
      else next[key] = cur;
      return next;
    });
  }

  function visSelectValue(rowKey: string): "def" | "show" | "hide" {
    const v = fichaOverrides[rowKey]?.visible;
    if (v === true) return "show";
    if (v === false) return "hide";
    return "def";
  }

  async function saveFicha() {
    setFichaSaving(true);
    setFichaErr(null);
    setFichaOk(null);
    const sb = createClient();
    if (!sb) {
      setFichaErr("Servicio no disponible.");
      setFichaSaving(false);
      return;
    }
    const config = {
      version: 1 as const,
      fieldOverrides: pruneFieldOverrides(fichaOverrides),
      sectionOrder: fichaSectionOrder
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean),
    };
    const { error } = await sb.from("portal_inventario_ficha_config").upsert({ id: 1, config }, { onConflict: "id" });
    if (error) {
      setFichaErr(error.message);
      setFichaSaving(false);
      return;
    }
    setFichaOk("Ficha de subastas guardada correctamente.");
    setFichaSaving(false);
  }

  const extraFieldKeys = Object.keys(fichaOverrides).filter((k) => !PORTAL_KEY_SET.has(k) && !INVENTORY_PRESET_KEY_SET.has(k));

  function addCustomFieldKey() {
    const nk = normalizeMapKey(customKeyInput.trim());
    if (!nk.length) return;
    if (!customLabelDraft.trim()) {
      setFichaErr("Para añadir una clave nueva escribí un título público inicial (podés editarlo después).");
      return;
    }
    setFichaOverrides((prev) => ({
      ...prev,
      [nk]: {
        ...(prev[nk] ?? {}),
        label: customLabelDraft.trim().slice(0, 320),
      },
    }));
    setCustomKeyInput("");
    setCustomLabelDraft("");
    setFichaOk(null);
    setFichaErr(null);
  }

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
              ¿Faltan migraciones en Supabase? Podés ejecutar{" "}
              <strong className="font-semibold">supabase/migrations/portal_home_hero_carousel.sql</strong> (carrusel) y{" "}
              <strong className="font-semibold">supabase/migrations/portal_inventario_ficha_config.sql</strong>{" "}
              (ficha subastas).
            </span>
          ) : null}
        </p>
      ) : null}

      {loading ? (
        <p className="text-neutral-400">Cargando…</p>
      ) : (
        <>
          {ok ? <p className="rounded-lg border border-emerald-500/35 bg-emerald-950/20 px-4 py-3 text-sm text-emerald-100">{ok}</p> : null}
          {fichaLoadErr || fichaErr ? (
            <p
              className={`rounded-lg border px-4 py-3 text-sm ${
                missingFichaSql ? "border-amber-500/50 bg-amber-950/30 text-amber-100" : "border-red-500/40 bg-red-950/20 text-red-200"
              }`}
            >
              {fichaLoadErr ?? fichaErr}
              {missingFichaSql ? (
                <span className="mt-2 block">
                  Si la tabla no existe, ejecutá{" "}
                  <strong className="font-semibold">supabase/migrations/portal_inventario_ficha_config.sql</strong>.
                </span>
              ) : null}
            </p>
          ) : null}
          {fichaOk ? <p className="rounded-lg border border-emerald-500/35 bg-emerald-950/20 px-4 py-3 text-sm text-emerald-100">{fichaOk}</p> : null}

          <p className="text-sm font-semibold text-[#84d8ec]">Carrusel del inicio</p>
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

          <hr className="border-white/10" />

          <div className="space-y-4">
            <div>
              <p className="text-sm font-semibold text-[#84d8ec]">Ficha pública en subastas</p>
              <p className="mt-1 max-w-[70ch] text-xs text-neutral-400">
                Controlá títulos, visibilidad y orden de los campos en la vista de cada vehículo. Las claves técnicas de inventario
                coinciden con los nombres internos normalizados (ej. <span className="font-mono text-neutral-300">marca</span>,{" "}
                <span className="font-mono text-neutral-300">fields_model</span>). Podés mover un campo a otro bloque con
                &quot;Agrupación&quot;.
              </p>
            </div>

            <div className="rounded-xl border border-white/10 bg-[#141c28] p-5">
              <p className="text-sm font-semibold text-white">Orden de bloques (títulos de sección)</p>
              <p className="mt-1 text-xs text-neutral-400">Una línea por título, en el orden deseado (como en el catálogo).</p>
              <textarea
                value={fichaSectionOrder}
                onChange={(e) => {
                  setFichaSectionOrder(e.target.value);
                  setFichaOk(null);
                }}
                rows={10}
                className="mt-3 w-full rounded border border-white/15 bg-black/35 px-3 py-2 font-mono text-xs text-neutral-100"
              />
              <button
                type="button"
                disabled={fichaSaving}
                onClick={() => {
                  setFichaSectionOrder([...defaultFichaSectionOrderTitles()].join("\n"));
                  setFichaOk(null);
                }}
                className="mt-3 rounded-lg border border-white/20 px-4 py-2 text-xs font-semibold text-neutral-200 hover:bg-white/5"
              >
                Restaurar orden sugerido
              </button>
            </div>

            <div className="rounded-xl border border-white/10 bg-[#141c28] p-5">
              <p className="text-sm font-semibold text-white">Bloque «Este lote en Vedisa Remates»</p>
              <div className="mt-4 space-y-4">
                {PORTAL_BANNER_ADMIN_DEFS.map((def) => (
                  <div key={def.key} className="rounded-lg border border-white/10 bg-black/25 p-4">
                    <p className="break-all font-mono text-[11px] text-[#81e0f5]/90">{def.key}</p>
                    <p className="mt-1 text-xs text-neutral-500">
                      Por defecto: {def.hiddenByDefault ? "oculto" : "visible"}. Etiqueta sugerida: {def.defaultLabel}
                    </p>
                    <div className="mt-3 grid gap-3 lg:grid-cols-12 lg:gap-4">
                      <label className="lg:col-span-4">
                        <span className="block text-[11px] text-neutral-400">Visibilidad</span>
                        <select
                          className="mt-1 w-full rounded border border-white/15 bg-black/35 px-2 py-2 text-sm text-white"
                          value={visSelectValue(def.key)}
                          onChange={(e) => setVisibilityMode(def.key, e.target.value as "def" | "show" | "hide")}
                        >
                          <option value="def">Predeterminado del sitio</option>
                          <option value="show">Mostrar siempre</option>
                          <option value="hide">Ocultar siempre</option>
                        </select>
                      </label>
                      <label className="lg:col-span-5">
                        <span className="block text-[11px] text-neutral-400">Título público</span>
                        <input
                          placeholder={def.defaultLabel}
                          value={fichaOverrides[def.key]?.label ?? ""}
                          onChange={(e) => {
                            const raw = e.target.value;
                            setFichaOk(null);
                            setFichaOverrides((prev) => {
                              const next = { ...prev };
                              const cur: PortalFichaFieldOverride = { ...(next[def.key] ?? {}) };
                              const t = raw.trim().slice(0, 320);
                              if (!t) delete cur.label;
                              else cur.label = t;
                              if (isEmptyOverrideEntry(cur)) delete next[def.key];
                              else next[def.key] = cur;
                              return next;
                            });
                          }}
                          className="mt-1 w-full rounded border border-white/15 bg-black/35 px-3 py-2 text-sm text-white"
                        />
                      </label>
                      <label className="lg:col-span-3">
                        <span className="block text-[11px] text-neutral-400">Orden (menor primero)</span>
                        <input
                          type="number"
                          placeholder={String(def.defaultOrder)}
                          value={
                            typeof fichaOverrides[def.key]?.order === "number"
                              ? String(fichaOverrides[def.key]!.order)
                              : ""
                          }
                          onChange={(e) => {
                            const raw = e.target.value;
                            setFichaOk(null);
                            setFichaOverrides((prev) => {
                              const next = { ...prev };
                              const cur: PortalFichaFieldOverride = { ...(next[def.key] ?? {}) };
                              if (!raw.trim()) delete cur.order;
                              else {
                                const n = Number(raw);
                                if (Number.isFinite(n)) cur.order = Math.round(n);
                              }
                              if (isEmptyOverrideEntry(cur)) delete next[def.key];
                              else next[def.key] = cur;
                              return next;
                            });
                          }}
                          className="mt-1 w-full rounded border border-white/15 bg-black/35 px-3 py-2 text-sm text-white"
                        />
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-[#141c28] p-5">
              <p className="text-sm font-semibold text-white">Ficha técnica / inventario (presets Tasaciones)</p>
              <p className="mt-2 text-[11px] text-neutral-500">
                Tip: cada fila muestra alias posibles entre paréntesis. La configuración usa la primera clave (hint); si tus datos llegan solo bajo otro alias, agregalo abajo como clave manual.
              </p>
              <div className="mt-4 max-h-[560px] space-y-3 overflow-auto pr-1">
                {INV_FICHA_PRESETS.map((pre) => {
                  const fk = pre.sourceKeyHint;
                  const aliasPretty = [...new Set(pre.aliases)].join(", ");
                  return (
                    <div key={fk} className="rounded-lg border border-white/10 bg-black/25 p-4">
                      <p className="font-mono text-[11px] text-[#81e0f5]/90">{fk}</p>
                      <p className="mt-1 text-[11px] text-neutral-500">
                        Agrupación sugerida: {pre.sectionTitle}. Aliases técn.: {aliasPretty}
                      </p>
                      <div className="mt-3 grid gap-3 lg:grid-cols-12 lg:gap-4">
                        <label className="lg:col-span-3">
                          <span className="block text-[11px] text-neutral-400">Visibilidad</span>
                          <select
                            className="mt-1 w-full rounded border border-white/15 bg-black/35 px-2 py-2 text-sm text-white"
                            value={visSelectValue(fk)}
                            onChange={(e) => setVisibilityMode(fk, e.target.value as "def" | "show" | "hide")}
                          >
                            <option value="def">Predeterminado (visible si hay valor)</option>
                            <option value="show">Mostrar siempre</option>
                            <option value="hide">Ocultar siempre</option>
                          </select>
                        </label>
                        <label className="lg:col-span-4">
                          <span className="block text-[11px] text-neutral-400">Título público</span>
                          <input
                            placeholder={pre.defaultLabel}
                            value={fichaOverrides[fk]?.label ?? ""}
                            onChange={(e) => {
                              const raw = e.target.value;
                              setFichaOk(null);
                              setFichaOverrides((prev) => {
                                const next = { ...prev };
                                const cur: PortalFichaFieldOverride = { ...(next[fk] ?? {}) };
                                const t = raw.trim().slice(0, 320);
                                if (!t) delete cur.label;
                                else cur.label = t;
                                if (isEmptyOverrideEntry(cur)) delete next[fk];
                                else next[fk] = cur;
                                return next;
                              });
                            }}
                            className="mt-1 w-full rounded border border-white/15 bg-black/35 px-3 py-2 text-sm text-white"
                          />
                        </label>
                        <label className="lg:col-span-3">
                          <span className="block text-[11px] text-neutral-400">Agrupación (bloque visible)</span>
                          <input
                            placeholder={pre.sectionTitle}
                            value={fichaOverrides[fk]?.sectionTitle ?? ""}
                            onChange={(e) => {
                              const raw = e.target.value;
                              setFichaOk(null);
                              setFichaOverrides((prev) => {
                                const next = { ...prev };
                                const cur: PortalFichaFieldOverride = { ...(next[fk] ?? {}) };
                                const t = raw.trim().slice(0, 240);
                                if (!t) delete cur.sectionTitle;
                                else cur.sectionTitle = t;
                                if (isEmptyOverrideEntry(cur)) delete next[fk];
                                else next[fk] = cur;
                                return next;
                              });
                            }}
                            className="mt-1 w-full rounded border border-white/15 bg-black/35 px-3 py-2 text-sm text-white"
                          />
                        </label>
                        <label className="lg:col-span-2">
                          <span className="block text-[11px] text-neutral-400">Orden</span>
                          <input
                            type="number"
                            placeholder="auto"
                            value={typeof fichaOverrides[fk]?.order === "number" ? String(fichaOverrides[fk]!.order) : ""}
                            onChange={(e) => {
                              const raw = e.target.value;
                              setFichaOk(null);
                              setFichaOverrides((prev) => {
                                const next = { ...prev };
                                const cur: PortalFichaFieldOverride = { ...(next[fk] ?? {}) };
                                if (!raw.trim()) delete cur.order;
                                else {
                                  const n = Number(raw);
                                  if (Number.isFinite(n)) cur.order = Math.round(n);
                                }
                                if (isEmptyOverrideEntry(cur)) delete next[fk];
                                else next[fk] = cur;
                                return next;
                              });
                            }}
                            className="mt-1 w-full rounded border border-white/15 bg-black/35 px-3 py-2 text-sm text-white"
                          />
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-[#141c28] p-5">
              <p className="text-sm font-semibold text-white">Campos dinámicos / claves fuera del preset</p>
              <p className="mt-1 text-xs text-neutral-400">
                Cuando llegan claves específicas (p. ej. <span className="font-mono">aws_campos_cylinder_capacity</span>), agregalas
                acá usando el mismo texto normalizado de la etiqueta técnica.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <input
                  placeholder="clave_tecnica"
                  value={customKeyInput}
                  onChange={(e) => setCustomKeyInput(e.target.value)}
                  className="min-w-[200px] flex-1 rounded border border-white/15 bg-black/35 px-3 py-2 font-mono text-sm text-white"
                />
                <input
                  placeholder="Título opcional para la clave nueva"
                  value={customLabelDraft}
                  onChange={(e) => setCustomLabelDraft(e.target.value)}
                  className="min-w-[200px] flex-[2] rounded border border-white/15 bg-black/35 px-3 py-2 text-sm text-white"
                />
                <button
                  type="button"
                  disabled={fichaSaving}
                  onClick={() => addCustomFieldKey()}
                  className="rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold text-neutral-100 hover:bg-white/[0.14]"
                >
                  Añadir clave al mapa de personalización
                </button>
              </div>

              {extraFieldKeys.length ? (
                <ul className="mt-4 space-y-3">
                  {extraFieldKeys.map((ek) => (
                    <li key={ek} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/25 px-3 py-2">
                      <span className="font-mono text-xs text-neutral-300">{ek}</span>
                      <button
                        type="button"
                        className="text-xs font-semibold text-rose-300 hover:underline"
                        onClick={() => {
                          setFichaOverrides((prev) => {
                            const next = { ...prev };
                            delete next[ek];
                            return next;
                          });
                          setFichaOk(null);
                        }}
                      >
                        Quitar personalización para esta clave
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-xs text-neutral-500">Por ahora no hay claves extra en la configuración.</p>
              )}
            </div>

            <button
              type="button"
              disabled={fichaSaving}
              onClick={() => void saveFicha()}
              className="rounded-lg bg-[#33C7E3] px-6 py-2.5 text-sm font-bold text-[#0f1f2c] disabled:opacity-50"
            >
              {fichaSaving ? "Guardando…" : "Guardar ficha de subastas"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
