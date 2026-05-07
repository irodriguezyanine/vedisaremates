"use client";

import Link from "next/link";

import { catalogoHref, SITE } from "@/lib/site-config";

import { VideoModal } from "./video-modal";

function IconPhone({ className }: { className?: string }) {
  return (
    <svg className={className} width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6.6 3.2c-.5 0-1 .2-1.4.5L3.5 5.4c-.7.7-.9 1.8-.4 2.7 1.5 2.8 3.7 5.3 6.4 7 1 .6 2.2.4 3-.4l1.2-1.2c.3-.3.3-.8 0-1.1l-2-2c-.2-.2-.6-.2-.9 0l-.9.9c-1.4-.8-2.5-1.9-3.3-3.3l.9-.9c.3-.3.3-.7 0-1l-2-2c-.2-.2-.4-.3-.7-.3h-.2z"
        fill="currentColor"
        opacity=".9"
      />
    </svg>
  );
}

function IconDoc({ className }: { className?: string }) {
  return (
    <svg className={className} width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M7 3h7l5 5v13a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path d="M14 3v5h5" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
    </svg>
  );
}

function IconMap({ className }: { className?: string }) {
  return (
    <svg className={className} width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 11.5a2 2 0 100-4 2 2 0 000 4z"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <path
        d="M19.5 8.5c0 6-7.5 11-7.5 11S4.5 14.5 4.5 8.5a7.5 7.5 0 1115 0z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const cellBase =
  "group relative flex min-h-[5.25rem] w-full flex-col items-center justify-center gap-2 px-4 py-5 text-center transition-all duration-200 sm:min-h-[5.75rem] sm:flex-row sm:gap-3 sm:text-left md:py-6";
const iconWrap =
  "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#009ade]/10 text-[#009ade] ring-1 ring-[#009ade]/20 transition group-hover:bg-[#009ade]/15 group-hover:ring-[#009ade]/40";
const labelStrong = "block text-[15px] font-bold text-[#0f2938] tracking-tight";
const labelSub = "text-[13px] font-medium leading-snug text-neutral-600 group-hover:text-neutral-900";

export function HeroActionBar() {
  const cat = catalogoHref();

  return (
    <div className="relative z-10 w-full shadow-[0_12px_40px_-8px_rgba(0,0,0,0.35)]">
      <div className="flex w-full border-y border-neutral-200/90 bg-[#fafbfd]/98 backdrop-blur-md">
        <div className="mx-auto grid w-full max-w-[1920px] grid-cols-2 lg:grid-cols-4">
          <Link
            href={SITE.whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            className={`${cellBase} border-r border-b border-neutral-200/90 lg:border-b-0`}
          >
            <span className={iconWrap}>
              <IconPhone className="h-5 w-5" />
            </span>
            <span className="max-w-[200px] sm:max-w-none">
              <span className={labelStrong}>Contact Center</span>
              <span className={`${labelSub} mt-0.5 block tabular-nums`}>{SITE.contactPhoneDisplay}</span>
            </span>
          </Link>

          <Link
            href={cat}
            target="_blank"
            rel="noopener noreferrer"
            className={`${cellBase} border-b border-neutral-200/90 lg:border-r lg:border-b-0`}
          >
            <span className={iconWrap}>
              <IconDoc className="h-5 w-5" />
            </span>
            <span className={labelStrong}>Ver catálogo</span>
          </Link>

          <VideoModal triggerClassName={`${cellBase} border-r border-neutral-200/90 lg:border-b-0 shrink-0`} />

          <Link
            href={SITE.mapsExhibicionHref}
            target="_blank"
            rel="noopener noreferrer"
            className={cellBase}
          >
            <span className={iconWrap}>
              <IconMap className="h-5 w-5" />
            </span>
            <span>
              <span className={labelStrong}>Cómo llegar</span>
              <span className={`${labelSub} mt-0.5 hidden sm:block`}>Arturo Prat 6457, Pudahuel</span>
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
}
