import { SiteFooter } from "@/components/site-footer";
import { GarantiaPendingBanner } from "@/components/garantia-pending-banner";
import { SiteHeader } from "@/components/site-header";
import { SkipLink } from "@/components/skip-link";
import { createClient } from "@/lib/supabase/server";

export default async function SiteGroupLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  let showGarantiaBanner = false;
  let userId: string | null = null;

  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userId = user?.id ?? null;
    const emailVerificado = Boolean(user?.email_confirmed_at);

    if (userId) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("garantia_aprobada, rol")
        .eq("id", userId)
        .maybeSingle();

      const isAdmin = String(profile?.rol ?? "").toLowerCase() === "admin";
      showGarantiaBanner = emailVerificado && !isAdmin && profile?.garantia_aprobada !== true;
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SkipLink />
      <SiteHeader />
      <GarantiaPendingBanner userId={userId} show={showGarantiaBanner} />
      <main id="contenido-principal" className="flex min-h-0 flex-1 flex-col outline-none focus:outline-none" tabIndex={-1}>
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
