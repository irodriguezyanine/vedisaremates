import type { SpecIconName, VehicleSpec } from "@/lib/vehicle-spec-summary";

function SpecIcon({ icon, className = "h-4 w-4 text-[#4f6b88]" }: { icon: SpecIconName; className?: string }) {
  if (icon === "km")
    return (
      <svg viewBox="0 0 20 20" className={className} fill="none" aria-hidden>
        <circle cx="10" cy="10" r="6.8" stroke="currentColor" strokeWidth="1.6" />
        <path d="M10 10 13.5 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="10" cy="10" r="1.1" fill="currentColor" />
      </svg>
    );
  if (icon === "year")
    return (
      <svg viewBox="0 0 20 20" className={className} fill="none" aria-hidden>
        <rect x="3.5" y="4.5" width="13" height="11.5" rx="1.8" stroke="currentColor" strokeWidth="1.6" />
        <path d="M6.5 3.5v2M13.5 3.5v2M3.5 8h13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  if (icon === "fuel")
    return (
      <svg viewBox="0 0 20 20" className={className} fill="none" aria-hidden>
        <path d="M4.5 4.5h6v11h-6z" stroke="currentColor" strokeWidth="1.6" />
        <path
          d="M10.5 7h1.8l1.4 1.6v4.4a1.7 1.7 0 0 0 3.4 0V9.8"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  if (icon === "gear")
    return (
      <svg viewBox="0 0 20 20" className={className} fill="none" aria-hidden>
        <circle cx="10" cy="6.5" r="2.3" stroke="currentColor" strokeWidth="1.6" />
        <path d="M5 15.3c.6-2.1 2.5-3.6 5-3.6s4.4 1.5 5 3.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M8 10h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  if (icon === "engineTest")
    return (
      <svg viewBox="0 0 20 20" className={className} fill="none" aria-hidden>
        <rect x="3.5" y="7" width="9.8" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.6" />
        <path d="M13.3 8.4h2.2M13.3 11.6h2.2M6.4 7V5.4M10.4 7V5.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  if (icon === "movementTest")
    return (
      <svg viewBox="0 0 20 20" className={className} fill="none" aria-hidden>
        <path d="M4 10h9.8M10.8 6l3.5 4-3.5 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  if (icon === "conditioned")
    return (
      <svg viewBox="0 0 20 20" className={className} fill="none" aria-hidden>
        <path
          d="M4.2 10.2h11.6M10.5 4.4c2.8.2 5 2.5 5 5.3 0 2.9-2.3 5.3-5.3 5.3-2.8 0-5.1-2.2-5.3-5"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    );
  if (icon === "singleOwner")
    return (
      <svg viewBox="0 0 20 20" className={className} fill="none" aria-hidden>
        <circle cx="10" cy="6.5" r="2.3" stroke="currentColor" strokeWidth="1.6" />
        <path d="M5 15.3c.6-2.1 2.5-3.6 5-3.6s4.4 1.5 5 3.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  if (icon === "airConditioning")
    return (
      <svg viewBox="0 0 20 20" className={className} fill="none" aria-hidden>
        <path
          d="M5 6.5h10M10 4.5v2M7.2 10.2l2.8-1.7 2.8 1.7M10 8.5V15.5"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  if (icon === "keys")
    return (
      <svg viewBox="0 0 20 20" className={className} fill="none" aria-hidden>
        <circle cx="7" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.6" />
        <path d="M9.5 10h6M13.5 10v1.8M15.5 10v1.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  if (icon === "traction")
    return (
      <svg viewBox="0 0 20 20" className={className} fill="none" aria-hidden>
        <circle cx="6" cy="14" r="1.7" stroke="currentColor" strokeWidth="1.6" />
        <circle cx="14" cy="14" r="1.7" stroke="currentColor" strokeWidth="1.6" />
        <path d="M5.5 12h9l-1-3.2H7.1L5.5 12Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
    );
  if (icon === "airbags")
    return (
      <svg viewBox="0 0 20 20" className={className} fill="none" aria-hidden>
        <circle cx="8.2" cy="7" r="2" stroke="currentColor" strokeWidth="1.6" />
        <path d="M4.8 14.8c.4-2 1.9-3.4 3.9-3.7M10.8 12.2h4.4M13 9.5v5.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  return null;
}

const SIZE_STYLES = {
  sm: {
    panel: "rounded-lg border border-sky-200/80 bg-[#f3f9ff] p-2.5",
    grid: "grid grid-cols-2 gap-x-2.5 gap-y-1.5 text-xs text-[#4f5a66]",
    icon: "h-4 w-4 text-[#4f6b88]",
    label: "text-[#51657d]",
    wideLabel: "text-[0.7rem] font-semibold uppercase leading-tight",
  },
  md: {
    panel: "rounded-2xl border border-sky-200/80 bg-[#f3f9ff] p-4 shadow-sm",
    grid: "grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm text-[#4f5a66] sm:grid-cols-2",
    icon: "h-[1.125rem] w-[1.125rem] text-[#4f6b88]",
    label: "font-medium text-[#3d5268]",
    wideLabel: "text-xs font-semibold uppercase leading-snug tracking-wide",
  },
} as const;

export function VehicleSpecGrid({
  specs,
  size = "md",
  className = "",
}: {
  specs: VehicleSpec[];
  size?: keyof typeof SIZE_STYLES;
  className?: string;
}) {
  if (!specs.length) return null;
  const s = SIZE_STYLES[size];
  return (
    <div className={`${s.panel} ${className}`.trim()}>
      <div className={s.grid}>
        {specs.map((spec) => (
          <div key={spec.key} className={`flex items-center gap-2.5 ${spec.wide ? "col-span-2" : ""}`}>
            <SpecIcon icon={spec.icon} className={s.icon} />
            <span className={spec.wide ? s.wideLabel : `truncate ${s.label}`}>{spec.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
