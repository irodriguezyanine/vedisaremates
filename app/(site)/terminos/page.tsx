import type { Metadata } from "next";

import { TerminosDocument } from "@/components/legal/terminos-document";

export const metadata: Metadata = {
  title: "Términos y condiciones",
  description: "Condiciones generales de participación en subastas Vedisa Remates.",
};

export default function TerminosPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
      <TerminosDocument />
    </div>
  );
}
