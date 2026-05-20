import { RemateSalaList } from "@/components/subastas/remate-sala-list";
import { SupabaseDeployWarning } from "@/components/supabase-deploy-warning";
import type { PortalRemateRecomendadoRow, PortalRemateRow } from "@/lib/portal-types";
import { fetchRemateThumbnailMap } from "@/lib/remate-cover-thumbnails";
import { createClient } from "@/lib/supabase/server";

export default async function SubastasIndexPage() {
  const supabase = await createClient();

  if (!supabase) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6">
        <h1 className="text-3xl font-black text-neutral-900">Sala de subastas</h1>
        <SupabaseDeployWarning />
      </div>
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("portal_remates")
    .select("*")
    .in("estado", ["publicado", "en_curso", "cerrado"])
    .order("ends_at", { ascending: true });

  const rows = ((data ?? []) as PortalRemateRow[]) ?? [];
  let recomendado: PortalRemateRecomendadoRow | null = null;
  if (user?.id) {
    const { data: recData } = await supabase.rpc("portal_recomendar_proximo_remate");
    const first = ((recData ?? []) as PortalRemateRecomendadoRow[])[0];
    if (first?.remate_id) recomendado = first;
  }

  const thumbMap = await fetchRemateThumbnailMap(
    supabase,
    rows.map((r) => r.id),
  );

  return (
    <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-black text-neutral-900 sm:text-4xl">Sala de subastas</h1>
      <p className="mt-3 max-w-2xl text-neutral-600">
        Eventos en vivo con ofertas en tiempo real. Inicie sesión para participar; si ya tiene usuario Vedisa desde otro
        canal, puede usar ese mismo correo y clave.
      </p>

      {error ? (
        <p className="mt-8 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          No se pudo cargar la lista. Verifique su conexión o pruebe nuevamente dentro de unos minutos.
        </p>
      ) : null}

      <RemateSalaList rows={rows} thumbMap={thumbMap} recomendado={recomendado} />
    </div>
  );
}
