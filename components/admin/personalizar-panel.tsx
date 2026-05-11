"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState, Fragment, type DragEvent, type SVGProps } from "react";

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
  PORTAL_BANNER_ADMIN_PANEL_DEFS,
  PORTAL_BANNER_KEYS_NEVER_PUBLIC,
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

const PK_FINE = "\u001f";
const DEFAULT_REMATE_CFG = {
  anti_sniping_enabled: true,
  anti_sniping_window_seconds: 120,
  anti_sniping_extend_seconds: 120,
};

function stripExcludedBannerOverrides(raw: Record<string, PortalFichaFieldOverride>): Record<string, PortalFichaFieldOverride> {
  const out = { ...raw };
  for (const k of PORTAL_BANNER_KEYS_NEVER_PUBLIC) delete out[k];
  return out;
}

function IconGripDrag({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor" aria-hidden>
      <circle cx="6" cy="5" r="1.5" />
      <circle cx="14" cy="5" r="1.5" />
      <circle cx="6" cy="10" r="1.5" />
      <circle cx="14" cy="10" r="1.5" />
      <circle cx="6" cy="15" r="1.5" />
      <circle cx="14" cy="15" r="1.5" />
    </svg>
  );
}

function IconPencil({ className, ...p }: SVGProps<SVGSVGElement>) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden {...p}>
      <path d="M12 20h9M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconEyeOpen({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function IconEyeOff({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path
        d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M1 1l22 22" strokeLinecap="round" />
    </svg>
  );
}

function IconEyeDefault({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" aria-hidden opacity={0.55}>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" strokeDasharray="2 3" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" opacity={0.7} />
    </svg>
  );
}

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
  const [heroTabIx, setHeroTabIx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [uploadIx, setUploadIx] = useState<number | null>(null);
  const [fichaOverrides, setFichaOverrides] = useState<Record<string, PortalFichaFieldOverride>>({});
  const [sectionOrderList, setSectionOrderList] = useState<string[]>(() => [...defaultFichaSectionOrderTitles()]);
  const [hiddenSections, setHiddenSections] = useState<string[]>([]);
  const [dragOverSectionIx, setDragOverSectionIx] = useState<number | null>(null);
  const [bannerDragIx, setBannerDragIx] = useState<number | null>(null);
  const [bannerEditKey, setBannerEditKey] = useState<string | null>(null);
  const [fineEditPk, setFineEditPk] = useState<string | null>(null);
  const [showTechRefs, setShowTechRefs] = useState(false);
  const [fichaSaving, setFichaSaving] = useState(false);
  const [fichaOk, setFichaOk] = useState<string | null>(null);
  const [fichaErr, setFichaErr] = useState<string | null>(null);
  const [fichaLoadErr, setFichaLoadErr] = useState<string | null>(null);
  const [remateCfg, setRemateCfg] = useState({ ...DEFAULT_REMATE_CFG });
  const [remateCfgSaving, setRemateCfgSaving] = useState(false);
  const [remateCfgOk, setRemateCfgOk] = useState<string | null>(null);
  const [remateCfgErr, setRemateCfgErr] = useState<string | null>(null);
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
    const [heroRes, fichaRes, remateCfgRes] = await Promise.all([
      sb.from("portal_home_hero").select("slides").eq("id", 1).maybeSingle(),
      sb.from("portal_inventario_ficha_config").select("config").eq("id", 1).maybeSingle(),
      sb
        .from("portal_remates_config")
        .select("anti_sniping_enabled, anti_sniping_window_seconds, anti_sniping_extend_seconds")
        .eq("id", 1)
        .maybeSingle(),
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
      setSectionOrderList([...defaultFichaSectionOrderTitles()]);
      setHiddenSections([]);
    } else {
      const cfg = parsePortalInventarioFichaConfig(fichaRes.data?.config ?? null);
      setFichaOverrides(stripExcludedBannerOverrides(cfg?.fieldOverrides ? { ...cfg.fieldOverrides } : {}));
      const orderTitles = cfg?.sectionOrder?.length ? cfg.sectionOrder : [...defaultFichaSectionOrderTitles()];
      setSectionOrderList(orderTitles.map((s) => s.trim()).filter(Boolean));
      setHiddenSections(cfg?.hiddenSectionTitles?.length ? [...cfg.hiddenSectionTitles] : []);
      setFichaLoadErr(null);
    }

    if (remateCfgRes.error) {
      setRemateCfgErr(remateCfgRes.error.message);
      setRemateCfg({ ...DEFAULT_REMATE_CFG });
    } else {
      setRemateCfg({
        anti_sniping_enabled: remateCfgRes.data?.anti_sniping_enabled ?? DEFAULT_REMATE_CFG.anti_sniping_enabled,
        anti_sniping_window_seconds:
          remateCfgRes.data?.anti_sniping_window_seconds ?? DEFAULT_REMATE_CFG.anti_sniping_window_seconds,
        anti_sniping_extend_seconds:
          remateCfgRes.data?.anti_sniping_extend_seconds ?? DEFAULT_REMATE_CFG.anti_sniping_extend_seconds,
      });
      setRemateCfgErr(null);
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
    const clean = sanitizeSlidesForSave(
      slides.map((slide, i) => ({
        ...slide,
        href: "/",
        alt: `Banner ${i + 1}`,
      })),
    );
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
  const missingRemateCfgSql =
    remateCfgErr?.includes("portal_remates_config") ||
    (remateCfgErr &&
      (/permission denied/i.test(remateCfgErr) || /does not exist/i.test(remateCfgErr) || /relation/i.test(remateCfgErr)));

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

  function cycleFieldVisibility(key: string) {
    const v = visSelectValue(key);
    setVisibilityMode(key, v === "def" ? "show" : v === "show" ? "hide" : "def");
  }

  function visibilityCycleHint(mode: "def" | "show" | "hide"): string {
    if (mode === "def") return "Visibilidad: predeterminado Vedisa. Tocar → siempre visible → siempre oculto → predeterminado.";
    if (mode === "show") return "Visibilidad: siempre visible. Tocar para ocultar siempre.";
    return "Visibilidad: oculto siempre. Tocar para volver al predeterminado.";
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
      fieldOverrides: pruneFieldOverrides(stripExcludedBannerOverrides(fichaOverrides)),
      sectionOrder: sectionOrderList.map((l) => l.trim()).filter(Boolean),
      hiddenSectionTitles: hiddenSections,
    };
    const { error } = await sb.from("portal_inventario_ficha_config").upsert({ id: 1, config }, { onConflict: "id" });
    if (error) {
      setFichaErr(error.message);
      setFichaSaving(false);
      return;
    }
    setFichaOk("Listo: la ficha pública ya quedó guardada como la configuraste.");
    setFichaSaving(false);
  }

  async function saveRemateConfig() {
    setRemateCfgSaving(true);
    setRemateCfgErr(null);
    setRemateCfgOk(null);
    const sb = createClient();
    if (!sb) {
      setRemateCfgErr("Servicio no disponible.");
      setRemateCfgSaving(false);
      return;
    }
    const payload = {
      id: 1,
      anti_sniping_enabled: remateCfg.anti_sniping_enabled,
      anti_sniping_window_seconds: Math.max(0, Math.round(remateCfg.anti_sniping_window_seconds)),
      anti_sniping_extend_seconds: Math.max(0, Math.round(remateCfg.anti_sniping_extend_seconds)),
    };
    const { error } = await sb.from("portal_remates_config").upsert(payload, { onConflict: "id" });
    if (error) {
      setRemateCfgErr(error.message);
      setRemateCfgSaving(false);
      return;
    }
    setRemateCfgOk("Configuración de remates guardada.");
    setRemateCfgSaving(false);
  }

  function moveSection(ix: number, delta: number) {
    setFichaOk(null);
    setSectionOrderList((prev) => {
      const next = [...prev];
      const j = ix + delta;
      if (j < 0 || j >= next.length) return prev;
      const a = next[ix];
      const b = next[j];
      if (a === undefined || b === undefined) return prev;
      next[ix] = b;
      next[j] = a;
      return next;
    });
  }

  function reorderSectionByDrag(from: number, to: number) {
    setFichaOk(null);
    setSectionOrderList((prev) => {
      if (from === to || from < 0 || to < 0 || from >= prev.length || to >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(from, 1);
      if (item === undefined) return prev;
      next.splice(from < to ? to - 1 : to, 0, item);
      return next;
    });
  }

  function toggleSectionHidden(title: string) {
    setFichaOk(null);
    setHiddenSections((prev) => (prev.includes(title) ? prev.filter((t) => t !== title) : [...prev, title]));
  }

  /** Arrastre desde la asa (HTML5 drag-and-drop nativo). */
  const SECTION_DND_KEY = "application/x-vedisa-section-index";
  const BANNER_DND_KEY = "application/x-vedisa-banner-index";

  const orderedBannerPanelDefs = useMemo(() => {
    return [...PORTAL_BANNER_ADMIN_PANEL_DEFS].sort((a, b) => {
      const oa = fichaOverrides[a.key]?.order ?? a.defaultOrder;
      const ob = fichaOverrides[b.key]?.order ?? b.defaultOrder;
      if (oa !== ob) return oa - ob;
      return a.defaultOrder - b.defaultOrder;
    });
  }, [fichaOverrides]);

  function reorderBannerByDrag(from: number, to: number) {
    setFichaOk(null);
    const keys = orderedBannerPanelDefs.map((d) => d.key);
    if (from === to || from < 0 || to < 0 || from >= keys.length || to >= keys.length) return;
    const nextKeys = [...keys];
    const [moved] = nextKeys.splice(from, 1);
    if (moved === undefined) return;
    nextKeys.splice(from < to ? to - 1 : to, 0, moved);
    setFichaOverrides((prev) => {
      const next = { ...prev };
      for (let ix = 0; ix < nextKeys.length; ix++) {
        const key = nextKeys[ix];
        if (!key) continue;
        const cur: PortalFichaFieldOverride = { ...(next[key] ?? {}) };
        cur.order = (ix + 1) * 10;
        next[key] = cur;
      }
      return next;
    });
  }

  const presetsPorSeccion = useMemo(() => {
    const map = new Map<string, (typeof INV_FICHA_PRESETS)[number][]>();
    for (const row of INV_FICHA_PRESETS) {
      const list = map.get(row.sectionTitle) ?? [];
      list.push(row);
      map.set(row.sectionTitle, list);
    }
    return [...map.entries()];
  }, []);

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
          <div className="rounded-xl border border-white/10 bg-[#141c28] p-1">
            <div
              role="tablist"
              aria-label="Elegir banner del carrusel"
              className="flex flex-wrap gap-1 border-b border-white/10 p-2 sm:gap-2"
            >
              {slides.map((_, ix) => (
                <button
                  key={ix}
                  type="button"
                  role="tab"
                  aria-selected={heroTabIx === ix}
                  id={`hero-tab-${ix}`}
                  aria-controls={`hero-panel-${ix}`}
                  onClick={() => setHeroTabIx(ix)}
                  className={`rounded-lg px-3 py-2 text-sm font-semibold transition sm:px-4 ${
                    heroTabIx === ix
                      ? "bg-[#33C7E3]/20 text-[#dcf6ff] ring-1 ring-[#33C7E3]/40"
                      : "text-neutral-400 hover:bg-white/[0.06] hover:text-neutral-200"
                  }`}
                >
                  Banner {ix + 1}
                </button>
              ))}
            </div>
            {slides.map((s, ix) => (
              <div
                key={ix}
                role="tabpanel"
                id={`hero-panel-${ix}`}
                aria-labelledby={`hero-tab-${ix}`}
                hidden={heroTabIx !== ix}
              >
                <div className="p-5 pt-4">
                  <div className="flex flex-col gap-4 lg:flex-row">
                    <div className="relative h-44 w-full max-w-xl shrink-0 overflow-hidden rounded-lg border border-white/10 bg-black/40">
                      {/^https:\/\//i.test(s.src) ? (
                        <Image
                          src={s.src}
                          alt={`Vista previa banner ${ix + 1}`}
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
                </div>
              </div>
            ))}
          </div>

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
                setHeroTabIx(0);
                setOk(null);
                setErr(null);
              }}
              className="rounded-lg border border-white/20 px-4 py-2.5 text-sm text-neutral-200 hover:bg-white/5"
            >
              Rellenar con portadas incluidas (borrador local)
            </button>
          </div>

          <hr className="border-white/10" />

          <div className="space-y-6">
            <h2 className="text-base font-bold uppercase tracking-wide text-[#84d8ec]">Vista pública del vehículo en una subasta</h2>

            <div className="rounded-2xl border border-[#33C7E3]/35 bg-gradient-to-br from-[#0f1a24] to-[#0b1219] p-6">
              <p className="text-lg font-bold text-white">¿Qué estás tocando acá?</p>
              <p className="mt-2 max-w-[76ch] text-sm leading-relaxed text-neutral-300">
                Esto <strong className="text-white">no cambia el sistema de Tasaciones</strong>: sólo la forma en que se lee el auto en la sala de remates. Son tres ideas distintas
                (no tienen el mismo lugar en la página):
              </p>
              <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-neutral-200">
                <li>
                  <strong className="text-white">Capítulos grandes</strong> (“Identificación”, “Motor”, “Otros datos…”): la misma idea que un catálogo en columnas. Ahí definís el orden, podés
                  arrastrar y podés <strong className="text-white">ocultar todo un capítulo</strong> en Internet.
                </li>
                <li>
                  <strong className="text-white">Tarjeta corta de precio y fechas</strong>: aparece <em>arriba de la foto grande</em> en la sala, con textos del evento y del lote. Es independiente de los
                  capítulos.
                </li>
                <li>
                  <strong className="text-white">Ajustes finos</strong> (abajo, cerrados por defecto): renombrar un renglón suelto o moverlo a otro capítulo. Abrilos sólo si falta algo muy específico.
                </li>
              </ul>
              <label className="mt-5 flex cursor-pointer items-start gap-2 text-xs text-neutral-400">
                <input
                  type="checkbox"
                  checked={showTechRefs}
                  onChange={(e) => setShowTechRefs(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-white/30 bg-black/50"
                />
                <span>Activar textos técnicos para cuando te ayude alguien del equipo de sistemas (opcional).</span>
              </label>
            </div>

            <div className="rounded-2xl border border-white/12 bg-[#141c28] p-5 sm:p-6">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-lg font-bold text-white">Capítulos del detalle (lista estilo catálogo)</p>
                  <p className="mt-1 max-w-[70ch] text-xs text-neutral-400">
                    Arrastrá desde el botón de puntos (izquierda) o usá Subir/Bajar.{" "}
                    <strong className="text-neutral-200">Ocultar</strong> hace desaparecer el capítulo entero en la web (sigue en tu lista por si lo querés volver a mostrar).
                  </p>
                </div>
              </div>
              <ol className="mt-5 space-y-2">
                {sectionOrderList.map((title, ix) => {
                  const hidden = hiddenSections.includes(title);
                  return (
                    <li
                      key={title}
                      onDragOver={(e: DragEvent) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "move";
                        setDragOverSectionIx(ix);
                      }}
                      onDragLeave={(e: DragEvent) => {
                        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverSectionIx((v) => (v === ix ? null : v));
                      }}
                      onDrop={(e: DragEvent) => {
                        e.preventDefault();
                        const from = Number(e.dataTransfer.getData(SECTION_DND_KEY));
                        if (!Number.isFinite(from)) return;
                        reorderSectionByDrag(from, ix);
                        setDragOverSectionIx(null);
                      }}
                      className={`flex flex-wrap items-center gap-2 rounded-xl border px-2 py-2 sm:gap-3 sm:px-3 sm:py-3 ${
                        hidden
                          ? "border-dashed border-amber-500/35 bg-amber-950/15"
                          : dragOverSectionIx === ix
                            ? "border-[#33C7E3]/60 bg-[#33C7E3]/10 ring-1 ring-[#33C7E3]/35"
                            : "border-white/10 bg-black/30"
                      }`}
                    >
                      <button
                        type="button"
                        draggable
                        aria-label={`Arrastrar "${title}"`}
                        onDragStart={(e: DragEvent) => {
                          e.dataTransfer.setData(SECTION_DND_KEY, String(ix));
                          e.dataTransfer.effectAllowed = "move";
                        }}
                        onDragEnd={() => setDragOverSectionIx(null)}
                        className="flex h-11 w-11 shrink-0 cursor-grab touch-manipulation items-center justify-center rounded-lg border border-white/10 bg-black/40 text-neutral-300 active:cursor-grabbing"
                      >
                        <svg
                          className="h-5 w-5 text-neutral-400"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                          aria-hidden
                        >
                          <circle cx="6" cy="5" r="1.5" />
                          <circle cx="14" cy="5" r="1.5" />
                          <circle cx="6" cy="10" r="1.5" />
                          <circle cx="14" cy="10" r="1.5" />
                          <circle cx="6" cy="15" r="1.5" />
                          <circle cx="14" cy="15" r="1.5" />
                        </svg>
                      </button>
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#33C7E3]/26 text-sm font-black text-[#dcf6ff]">
                        {ix + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <span className={`block text-sm font-medium ${hidden ? "text-neutral-500 line-through" : "text-neutral-50"}`}>{title}</span>
                        {hidden ? <span className="mt-0.5 block text-[11px] font-semibold text-amber-200/90">Oculto en la web</span> : null}
                      </div>
                      <div className="flex w-full shrink-0 flex-wrap gap-1.5 sm:w-auto sm:justify-end">
                        <button
                          type="button"
                          disabled={fichaSaving}
                          onClick={() => toggleSectionHidden(title)}
                          className={`rounded-lg border px-3 py-1.5 text-xs font-bold ${
                            hidden
                              ? "border-emerald-400/50 text-emerald-200 hover:bg-emerald-500/10"
                              : "border-white/15 text-neutral-100 hover:bg-white/[0.08]"
                          }`}
                        >
                          {hidden ? "Mostrar" : "Ocultar"}
                        </button>
                        <button
                          type="button"
                          disabled={ix === 0 || fichaSaving}
                          onClick={() => moveSection(ix, -1)}
                          aria-label={`Mover "${title}" hacia arriba`}
                          className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-bold text-neutral-100 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Subir
                        </button>
                        <button
                          type="button"
                          disabled={ix >= sectionOrderList.length - 1 || fichaSaving}
                          onClick={() => moveSection(ix, 1)}
                          aria-label={`Mover "${title}" hacia abajo`}
                          className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-bold text-neutral-100 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Bajar
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ol>
              <button
                type="button"
                disabled={fichaSaving}
                onClick={() => {
                  setSectionOrderList([...defaultFichaSectionOrderTitles()]);
                  setHiddenSections([]);
                  setFichaOk(null);
                }}
                className="mt-5 rounded-xl border border-white/20 px-4 py-2 text-xs font-bold text-neutral-100 hover:bg-white/[0.06]"
              >
                Volver todo al formato recomendado (orden visible y capítulos mostrados)
              </button>
            </div>

            <div className="rounded-xl border border-white/10 bg-[#141c28] p-4 sm:p-5">
              <p className="text-base font-bold text-white">Tarjeta de precio y fechas (arriba de la foto grande)</p>
              <p className="mt-2 text-xs text-neutral-400">
                Franja con datos del lote y del remate (no es un capítulo del catálogo). Los códigos internos no se listan acá: ni en el panel ni en la sala. Arrastrá filas para orden;
                el ojo cambia ver / ocultar / valor Vedisa; el lápiz abre nombre público y orden manual.
              </p>
              <div className="mt-4 overflow-x-auto rounded-lg border border-white/10">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-white/10 bg-black/30 text-[10px] font-bold uppercase tracking-wide text-neutral-500">
                      <th className="w-12 px-2 py-2" aria-label="Orden">
                        <span className="sr-only">Orden</span>
                      </th>
                      <th className="px-2 py-2">Campo</th>
                      <th className="w-14 px-2 py-2 text-center" title="Visibilidad">
                        Ver
                      </th>
                      <th className="w-14 px-2 py-2 text-center" title="Editar texto y orden">
                        Edit.
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {orderedBannerPanelDefs.map((def, ix) => {
                      const vm = visSelectValue(def.key);
                      const editing = bannerEditKey === def.key;
                      return (
                        <Fragment key={def.key}>
                          <tr
                            className={`border-b border-white/10 bg-black/15 ${bannerDragIx === ix ? "bg-[#33C7E3]/10 ring-1 ring-[#33C7E3]/30" : ""}`}
                            onDragOver={(e: DragEvent) => {
                              e.preventDefault();
                              e.dataTransfer.dropEffect = "move";
                              setBannerDragIx(ix);
                            }}
                            onDragLeave={(e: DragEvent) => {
                              if (!e.currentTarget.contains(e.relatedTarget as Node)) setBannerDragIx((v) => (v === ix ? null : v));
                            }}
                            onDrop={(e: DragEvent) => {
                              e.preventDefault();
                              const from = Number(e.dataTransfer.getData(BANNER_DND_KEY));
                              if (!Number.isFinite(from)) return;
                              reorderBannerByDrag(from, ix);
                              setBannerDragIx(null);
                            }}
                          >
                            <td className="align-middle px-2 py-1">
                              <button
                                type="button"
                                draggable
                                aria-label={`Arrastrar fila ${def.tituloEnPanel}`}
                                onDragStart={(e: DragEvent) => {
                                  e.dataTransfer.setData(BANNER_DND_KEY, String(ix));
                                  e.dataTransfer.effectAllowed = "move";
                                }}
                                onDragEnd={() => setBannerDragIx(null)}
                                className="flex h-9 w-9 cursor-grab touch-manipulation items-center justify-center rounded-md border border-white/10 bg-black/40 text-neutral-400 active:cursor-grabbing"
                              >
                                <IconGripDrag className="h-4 w-4" />
                              </button>
                            </td>
                            <td className="align-middle px-2 py-2">
                              <span className="font-medium text-neutral-100">{def.tituloEnPanel}</span>
                              <span className="mt-0.5 block text-[11px] text-neutral-500">
                                {def.hiddenByDefault ? "Suele ir oculto" : "Suele verse"} · {def.ayudaParaAdmin}
                              </span>
                              {showTechRefs ? (
                                <span className="mt-1 block break-all font-mono text-[9px] text-amber-200/75">{def.key}</span>
                              ) : null}
                            </td>
                            <td className="align-middle px-2 py-2 text-center">
                              <button
                                type="button"
                                disabled={fichaSaving}
                                title={visibilityCycleHint(vm)}
                                aria-label={visibilityCycleHint(vm)}
                                onClick={() => cycleFieldVisibility(def.key)}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 hover:bg-white/[0.08]"
                              >
                                {vm === "show" ? (
                                  <IconEyeOpen className="h-5 w-5 text-emerald-300" />
                                ) : vm === "hide" ? (
                                  <IconEyeOff className="h-5 w-5 text-rose-300" />
                                ) : (
                                  <IconEyeDefault className="h-5 w-5 text-neutral-400" />
                                )}
                              </button>
                            </td>
                            <td className="align-middle px-2 py-2 text-center">
                              <button
                                type="button"
                                disabled={fichaSaving}
                                aria-expanded={editing}
                                aria-label={editing ? "Cerrar edición" : `Editar ${def.tituloEnPanel}`}
                                onClick={() => setBannerEditKey(editing ? null : def.key)}
                                className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border ${
                                  editing ? "border-[#33C7E3]/50 bg-[#33C7E3]/15 text-[#bdefff]" : "border-white/15 text-neutral-300 hover:bg-white/[0.08]"
                                }`}
                              >
                                <IconPencil className="h-4 w-4" />
                              </button>
                            </td>
                          </tr>
                          {editing ? (
                            <tr className="border-b border-white/10 bg-black/40">
                              <td colSpan={4} className="px-3 py-3">
                                <div className="grid gap-3 sm:grid-cols-12">
                                  <label className="block sm:col-span-8">
                                    <span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Nombre público (opcional)</span>
                                    <input
                                      placeholder={`Predeterminado: ${def.defaultLabel}`}
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
                                      className="mt-1 w-full rounded border border-white/15 bg-black/45 px-3 py-2 text-sm text-white"
                                    />
                                  </label>
                                  <label className="block sm:col-span-4">
                                    <span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Orden (número menor, más arriba)</span>
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
                                      className="mt-1 w-full rounded border border-white/15 bg-black/45 px-3 py-2 text-sm text-white"
                                    />
                                  </label>
                                </div>
                              </td>
                            </tr>
                          ) : null}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <details className="group rounded-xl border border-white/10 bg-[#141c28]">
              <summary className="cursor-pointer list-none px-5 py-4 text-left [&::-webkit-details-marker]:hidden">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                  <p className="text-base font-bold text-white">Ajustes finos · renglones dentro de cada capítulo</p>
                  <span className="text-xs font-semibold text-[#84d8ec]">Tocar para abrir</span>
                </div>
                <p className="mt-2 max-w-[72ch] text-xs text-neutral-400">
                  Tablas compactas por capítulo: ojo para visibilidad, lápiz para título público, capítulo destino y prioridad. Abrí sólo lo que necesites tocar.
                </p>
              </summary>
              <div className="space-y-3 border-t border-white/10 px-3 pb-4 pt-4 sm:px-5">
                {presetsPorSeccion.map(([sectionTitle, rows]) => (
                  <details key={sectionTitle} className="group rounded-lg border border-white/10 bg-black/27">
                    <summary className="cursor-pointer select-none px-3 py-2.5 text-sm font-bold text-[#bdefff] sm:px-4 [&::-webkit-details-marker]:hidden">
                      <span className="flex items-center justify-between gap-3">
                        <span>{sectionTitle}</span>
                        <span className="text-xs font-medium text-neutral-400">{rows.length} datos</span>
                      </span>
                    </summary>
                    <div className="overflow-x-auto border-t border-white/10">
                      <table className="w-full border-collapse text-left text-sm">
                        <thead>
                          <tr className="border-b border-white/10 bg-black/35 text-[10px] font-bold uppercase tracking-wide text-neutral-500">
                            <th className="px-3 py-2">Dato</th>
                            <th className="w-14 px-2 py-2 text-center">Ver</th>
                            <th className="w-14 px-2 py-2 text-center">Edit.</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((pre) => {
                            const fk = pre.sourceKeyHint;
                            const aliasPretty = [...new Set(pre.aliases)].filter((a) => a !== fk).join(", ");
                            const pk = `${sectionTitle}${PK_FINE}${fk}`;
                            const vm = visSelectValue(fk);
                            const editing = fineEditPk === pk;
                            return (
                              <Fragment key={pk}>
                                <tr className="border-b border-white/10 bg-black/20">
                                  <td className="px-3 py-2 align-middle">
                                    <span className="font-medium text-neutral-100">{pre.defaultLabel}</span>
                                    <span className="mt-0.5 block text-[11px] text-neutral-500">
                                      {aliasPretty ? `También: ${aliasPretty}` : "Una sola etiqueta en origen"}
                                    </span>
                                    {showTechRefs ? (
                                      <span className="mt-0.5 block break-all font-mono text-[9px] text-amber-200/75">{fk}</span>
                                    ) : null}
                                  </td>
                                  <td className="align-middle px-2 py-1.5 text-center">
                                    <button
                                      type="button"
                                      disabled={fichaSaving}
                                      title={visibilityCycleHint(vm)}
                                      aria-label={visibilityCycleHint(vm)}
                                      onClick={() => cycleFieldVisibility(fk)}
                                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 hover:bg-white/[0.08]"
                                    >
                                      {vm === "show" ? (
                                        <IconEyeOpen className="h-5 w-5 text-emerald-300" />
                                      ) : vm === "hide" ? (
                                        <IconEyeOff className="h-5 w-5 text-rose-300" />
                                      ) : (
                                        <IconEyeDefault className="h-5 w-5 text-neutral-400" />
                                      )}
                                    </button>
                                  </td>
                                  <td className="align-middle px-2 py-1.5 text-center">
                                    <button
                                      type="button"
                                      disabled={fichaSaving}
                                      aria-expanded={editing}
                                      aria-label={editing ? "Cerrar" : `Editar ${pre.defaultLabel}`}
                                      onClick={() => setFineEditPk(editing ? null : pk)}
                                      className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border ${
                                        editing ? "border-[#33C7E3]/50 bg-[#33C7E3]/15 text-[#bdefff]" : "border-white/15 text-neutral-300 hover:bg-white/[0.08]"
                                      }`}
                                    >
                                      <IconPencil className="h-4 w-4" />
                                    </button>
                                  </td>
                                </tr>
                                {editing ? (
                                  <tr className="border-b border-white/10 bg-black/40">
                                    <td colSpan={3} className="px-3 py-3">
                                      <div className="grid gap-3 lg:grid-cols-12">
                                        <label className="block lg:col-span-5">
                                          <span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Cómo se lee públicamente</span>
                                          <input
                                            placeholder={`Sugerimos: ${pre.defaultLabel}`}
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
                                            className="mt-1 w-full rounded border border-white/15 bg-black/45 px-3 py-2 text-sm text-white"
                                          />
                                        </label>
                                        <label className="block lg:col-span-4">
                                          <span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Capítulo (grupo)</span>
                                          <input
                                            placeholder={sectionTitle}
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
                                            className="mt-1 w-full rounded border border-white/15 bg-black/45 px-3 py-2 text-sm text-white"
                                          />
                                        </label>
                                        <label className="block lg:col-span-3">
                                          <span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Prioridad (nº menor antes)</span>
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
                                            className="mt-1 w-full rounded border border-white/15 bg-black/45 px-3 py-2 text-sm text-white"
                                          />
                                        </label>
                                      </div>
                                    </td>
                                  </tr>
                                ) : null}
                              </Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </details>
                ))}
              </div>
            </details>

            <details className="group rounded-xl border border-white/10 bg-[#141c28]">
              <summary className="cursor-pointer list-none px-5 py-4 text-left [&::-webkit-details-marker]:hidden">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                  <p className="text-base font-bold text-white">Campos extra del sistema (soporte / casos raros)</p>
                  <span className="text-xs font-semibold text-[#84d8ec]">Tocar para abrir</span>
                </div>
                <p className="mt-2 max-w-[72ch] text-xs text-neutral-400">
                  Sólo si ves un dato en Tasaciones que no aparece en los grupos de arriba: agregá la clave interna (sin espacios) y el título que debe leer el público. Si no sabés la clave, pedile a
                  soporte una captura con el nombre técnico.
                </p>
              </summary>
              <div className="border-t border-white/10 px-3 pb-5 pt-4 sm:px-5">
                <div className="overflow-x-auto rounded-lg border border-white/10">
                  <table className="w-full border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-white/10 bg-black/35 text-[10px] font-bold uppercase tracking-wide text-neutral-500">
                        <th className="min-w-[140px] px-3 py-2">Clave interna</th>
                        <th className="min-w-[180px] px-3 py-2">Título público</th>
                        <th className="w-32 px-2 py-2 text-right">Acción</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-white/10 bg-black/30">
                        <td className="px-3 py-2 align-top">
                          <input
                            value={customKeyInput}
                            onChange={(e) => setCustomKeyInput(e.target.value)}
                            className="w-full rounded border border-white/15 bg-black/45 px-2 py-1.5 text-sm text-white"
                            placeholder="sin_espacios"
                          />
                        </td>
                        <td className="px-3 py-2 align-top">
                          <input
                            value={customLabelDraft}
                            onChange={(e) => setCustomLabelDraft(e.target.value)}
                            className="w-full rounded border border-white/15 bg-black/45 px-2 py-1.5 text-sm text-white"
                            placeholder="Nombre que ve el público"
                          />
                        </td>
                        <td className="px-2 py-2 align-middle text-right whitespace-nowrap">
                          <button
                            type="button"
                            disabled={fichaSaving}
                            onClick={() => addCustomFieldKey()}
                            className="rounded-lg bg-[#33C7E3] px-3 py-1.5 text-xs font-bold text-[#0f1f2c] hover:bg-[#5ad4ec] disabled:opacity-45"
                          >
                            Agregar
                          </button>
                        </td>
                      </tr>
                      {extraFieldKeys.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="px-3 py-3 text-xs text-neutral-500">
                            Todavía no hay campos extra (normal en la mayoría de los casos).
                          </td>
                        </tr>
                      ) : (
                        extraFieldKeys.map((ek) => (
                          <tr key={ek} className="border-b border-white/10 bg-black/22">
                            <td className="px-3 py-2 align-middle">
                              <span className={`block max-w-[220px] truncate font-mono text-xs ${showTechRefs ? "text-amber-200/90" : "text-neutral-500"}`} title={ek}>
                                {showTechRefs ? ek : "—"}
                              </span>
                              {!showTechRefs ? (
                                <span className="mt-0.5 block text-[10px] text-neutral-600">Activá “textos técnicos” arriba para ver la clave.</span>
                              ) : null}
                            </td>
                            <td className="px-3 py-2 align-middle text-neutral-100">
                              {fichaOverrides[ek]?.label?.trim() || "—"}
                            </td>
                            <td className="px-2 py-2 align-middle text-right">
                              <button
                                type="button"
                                className="text-xs font-bold text-rose-300 underline-offset-2 hover:underline"
                                onClick={() => {
                                  setFichaOverrides((prev) => {
                                    const next = { ...prev };
                                    delete next[ek];
                                    return next;
                                  });
                                  setFichaOk(null);
                                }}
                              >
                                Quitar
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 text-[11px] text-neutral-500">Después de agregar filas recordá usar <strong className="text-neutral-400">Guardar estos cambios de la ficha</strong>.</p>
              </div>
            </details>

            <button
              type="button"
              disabled={fichaSaving}
              onClick={() => void saveFicha()}
              className="rounded-lg bg-[#33C7E3] px-6 py-2.5 text-sm font-bold text-[#0f1f2c] disabled:opacity-50"
            >
              {fichaSaving ? "Guardando…" : "Guardar estos cambios de la ficha"}
            </button>
          </div>

          <hr className="border-white/10" />

          <div className="space-y-4 rounded-xl border border-white/10 bg-[#141c28] p-5">
            <div>
              <h2 className="text-base font-bold uppercase tracking-wide text-[#84d8ec]">Configuración remates</h2>
              <p className="mt-1 text-xs text-neutral-400">
                Ajustes globales de la dinámica de pujas en vivo (estilo anti-sniping tipo Raiworks).
              </p>
            </div>
            {remateCfgErr ? (
              <p
                className={`rounded-lg border px-4 py-3 text-sm ${
                  missingRemateCfgSql ? "border-amber-500/50 bg-amber-950/30 text-amber-100" : "border-red-500/40 bg-red-950/20 text-red-200"
                }`}
              >
                {remateCfgErr}
                {missingRemateCfgSql ? (
                  <span className="mt-2 block">
                    Ejecuta la migración <strong className="font-semibold">supabase/migrations/portal_subastas_vedisaremates.sql</strong> actualizada.
                  </span>
                ) : null}
              </p>
            ) : null}
            {remateCfgOk ? <p className="rounded-lg border border-emerald-500/35 bg-emerald-950/20 px-4 py-3 text-sm text-emerald-100">{remateCfgOk}</p> : null}

            <label className="flex items-center gap-2 text-sm text-neutral-200">
              <input
                type="checkbox"
                checked={remateCfg.anti_sniping_enabled}
                onChange={(e) => {
                  setRemateCfg((prev) => ({ ...prev, anti_sniping_enabled: e.target.checked }));
                  setRemateCfgOk(null);
                }}
                className="h-4 w-4 rounded border-white/30 bg-black/40"
              />
              Extensión automática al recibir ofertas cerca del cierre
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm">
                <span className="text-neutral-400">Ventana final (segundos)</span>
                <input
                  type="number"
                  min={0}
                  value={remateCfg.anti_sniping_window_seconds}
                  onChange={(e) => {
                    setRemateCfg((prev) => ({ ...prev, anti_sniping_window_seconds: Number(e.target.value || 0) }));
                    setRemateCfgOk(null);
                  }}
                  className="mt-1 w-full rounded border border-white/15 bg-black/35 px-3 py-2 text-white"
                />
                <p className="mt-1 text-[11px] text-neutral-500">Si una oferta entra dentro de esta ventana, se activa la extensión.</p>
              </label>
              <label className="text-sm">
                <span className="text-neutral-400">Extensión por oferta (segundos)</span>
                <input
                  type="number"
                  min={0}
                  value={remateCfg.anti_sniping_extend_seconds}
                  onChange={(e) => {
                    setRemateCfg((prev) => ({ ...prev, anti_sniping_extend_seconds: Number(e.target.value || 0) }));
                    setRemateCfgOk(null);
                  }}
                  className="mt-1 w-full rounded border border-white/15 bg-black/35 px-3 py-2 text-white"
                />
                <p className="mt-1 text-[11px] text-neutral-500">Para “2 minutos”, usa 120.</p>
              </label>
            </div>

            <button
              type="button"
              disabled={remateCfgSaving}
              onClick={() => void saveRemateConfig()}
              className="rounded-lg bg-[#33C7E3] px-6 py-2.5 text-sm font-bold text-[#0f1f2c] disabled:opacity-50"
            >
              {remateCfgSaving ? "Guardando…" : "Guardar configuración remates"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
