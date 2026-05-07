export function HeroShine() {
  return (
    <section
      className="relative isolate w-full overflow-hidden bg-[#060d18] pb-9 pt-10 md:pb-12 md:pt-14"
      aria-labelledby="hero-title"
    >
      {/* Capas de profundidad */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_90%_60%_at_50%_-15%,rgba(51,199,227,0.45),transparent_58%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_50%_45%_at_90%_100%,rgba(255,193,7,0.18),transparent_55%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_40%_35%_at_5%_80%,rgba(0,154,222,0.2),transparent_50%)]"
      />
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.06] mix-blend-overlay"
        style={{
          backgroundImage: `linear-gradient(to right, rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.5) 1px, transparent 1px)`,
          backgroundSize: "56px 56px",
        }}
      />
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-[#060d18] to-transparent md:h-24"
      />

      <div className="relative mx-auto max-w-5xl px-5 text-center sm:px-8">
        <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.4em] text-[#33C7E3] sm:text-[11px]">
          Subastas online · Vehículos siniestrados
        </p>

        <h1
          id="hero-title"
          className="animate-hero-shine-title text-balance font-black leading-[1.12] sm:leading-[1.1] md:leading-[1.08]"
          style={{
            fontSize: "clamp(1.65rem, 4.5vw, 3.15rem)",
            backgroundImage:
              "linear-gradient(105deg, #7ee8ff 0%, #ffffff 28%, #e0f7ff 48%, #ffe566 72%, #33C7E3 100%)",
            backgroundSize: "200% auto",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          Bienvenidos al portal líder en subastas de vehículos siniestrados
        </h1>

        <p className="animate-hero-shine-sub mx-auto mt-4 max-w-2xl text-pretty text-base leading-snug text-slate-300 md:mt-5 md:text-lg md:leading-relaxed">
          Participa con transparencia:{" "}
          <span className="font-semibold text-white">regístrate</span>, asegura tu{" "}
          <span className="font-semibold text-[#FFC600]">garantía</span> y oferta en remates 100% online.
        </p>

        <div className="mx-auto mt-6 flex flex-wrap items-center justify-center gap-3 text-xs font-semibold uppercase tracking-wider text-slate-400 md:mt-7">
          <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[#33C7E3] backdrop-blur-sm">
            Exhibición Pudahuel
          </span>
          <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 backdrop-blur-sm">
            Inventario referencial
          </span>
          <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[#FFC600] backdrop-blur-sm">
            Contact Center activo
          </span>
        </div>
      </div>
    </section>
  );
}
