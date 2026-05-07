import { AuctionFeed } from "@/components/auction-feed";

const WHATSAPP = "https://wa.me/56989323397";
const MAPS =
  "https://www.google.com/maps/dir/?api=1&destination=Arturo+Prat+6457,+Noviciado,+Pudahuel";
const VIDEO_PLACEHOLDER = "#";
const CATALOGO_HREF =
  process.env.NEXT_PUBLIC_CATALOGO_URL ?? "https://catalogo.vedisaremates.cl/";

export default function HomePage() {
  return (
    <>
      <section className="relative overflow-hidden bg-gradient-to-b from-[#1e2838] via-[#252f3f] to-[#2d3b52] text-white">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 20%, #33c7e3 0%, transparent 44%), radial-gradient(circle at 85% 10%, #ffc600 0%, transparent 28%)",
          }}
        />
        <div className="relative mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-22 lg:px-8 lg:py-24">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-[#33C7E3]">
            Portal de subastas
          </p>
          <h1 className="max-w-3xl text-balance text-3xl font-bold tracking-tight sm:text-4xl lg:text-[2.65rem] lg:leading-tight">
            Bienvenidos al portal líder en subastas de vehículos siniestrados
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-white/85">
            Participá fácilmente: registrate y asegurá tu garantía para comenzar a ofertar.
          </p>

          <div className="mt-10 flex flex-wrap gap-3">
            <a
              href={WHATSAPP}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center rounded-md bg-white px-4 py-2.5 text-sm font-semibold text-[#252f3f] shadow hover:bg-[#f3f7fa]"
            >
              Contact Center: +56 9 8932 3397
            </a>
            <a
              href={CATALOGO_HREF}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center rounded-md border border-[#FFC600]/80 bg-[#FFC600] px-4 py-2.5 text-sm font-semibold text-[#252f3f] hover:bg-[#e6b200]"
            >
              Ver catálogo
            </a>
            <a
              href={VIDEO_PLACEHOLDER}
              className="inline-flex items-center rounded-md border border-white/35 px-4 py-2.5 text-sm font-medium text-white hover:bg-white/10"
            >
              ¿Cómo participar? (video)
            </a>
            <a
              href={MAPS}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center rounded-md border border-white/35 px-4 py-2.5 text-sm font-medium text-white hover:bg-white/10"
            >
              Cómo llegar
            </a>
          </div>
        </div>
      </section>

      <AuctionFeed />
    </>
  );
}
