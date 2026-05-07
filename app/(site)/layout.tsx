import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { SkipLink } from "@/components/skip-link";

export default function SiteGroupLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SkipLink />
      <SiteHeader />
      <main id="contenido-principal" className="flex min-h-0 flex-1 flex-col outline-none focus:outline-none" tabIndex={-1}>
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
