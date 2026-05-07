"use client";

import Script from "next/script";

type Props = {
  region: string;
  portalId: string;
  formId: string;
};

const TARGET_ID = "vedisa-hubspot-form-mount";

export function HubSpotForm({ region, portalId, formId }: Props) {
  const src = `https://js-${region}.hsforms.net/forms/embed/v2.js`;

  return (
    <div className="mt-8">
      <div id={TARGET_ID} className="min-h-[200px] rounded-xl border border-neutral-200 bg-white p-6 shadow-inner" />

      <Script
        src={src}
        strategy="lazyOnload"
        onLoad={() => {
          const w = window as unknown as {
            hbspt?: { forms: { create: (opts: Record<string, string>) => void } };
          };
          w.hbspt?.forms.create({
            region,
            portalId,
            formId,
            target: `#${TARGET_ID}`,
          });
        }}
      />
    </div>
  );
}
