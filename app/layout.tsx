import type { Metadata } from "next";
import { Inter } from "next/font/google";

import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://vedisaremates.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(base),
  title: {
    default: "VEDISA Remates · Portal de subastas",
    template: "%s · VEDISA Remates",
  },
  description:
    "Portal líder en subastas de vehículos siniestrados. Registro, garantía y ofertas en línea. Exhibición presencial Pudahuel.",
  openGraph: {
    locale: "es_CL",
    type: "website",
    siteName: "VEDISA Remates",
    title: "VEDISA Remates · Portal de subastas",
    description:
      "Subasta de vehículos siniestrados y activos recuperados para compañías y particulares. Transparencia y trayectoria.",
  },
  twitter: { card: "summary_large_image" },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const orgJsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "VEDISA Remates",
    url: base,
    telephone: "+56989323397",
    address: {
      "@type": "PostalAddress",
      streetAddress: "Arturo Prat 6457, Noviciado",
      addressLocality: "Pudahuel",
      addressCountry: "CL",
    },
  };

  return (
    <html lang="es" className={`${inter.variable} h-full`}>
      <body className="flex min-h-screen flex-col bg-[#fdfefe] font-sans text-neutral-900 antialiased">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd) }} />
        {children}
      </body>
    </html>
  );
}
