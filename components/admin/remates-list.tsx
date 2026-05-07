"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import type { PortalRemateRow } from "@/lib/portal-types";
import { SupabaseDeployWarning } from "@/components/supabase-deploy-warning";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/public-env";

export function RematesList() {
  const [items, setItems] = useState<PortalRemateRow[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    const sb = createClient();
    if (!sb) {
      setErr("Cliente Supabase sin configurar.");
      return;
    }
    const { data, error } = await sb.from("portal_remates").select("*").order("created_at", { ascending: false });
    if (error) {
      setErr(error.message);
      return;
    }
    setItems(((data ?? []) as PortalRemateRow[]) || []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function nuevo() {
    setErr(null);
    const sb = createClient();
    if (!sb) {
      setErr("Sin Supabase en este despliegue.");
      return;
    }
    const {
      data: { user },
    } = await sb.auth.getUser();
    const ends = new Date(Date.now() + 7 * 86400000).toISOString();
    const { data, error } = await sb
      .from("portal_remates")
      .insert({
        titulo: "Nuevo remate",
        estado: "borrador",
        ends_at: ends,
        created_by: user?.id ?? null,
      })
      .select("id")
      .single();

    if (error) {
      setErr(error.message);
      return;
    }
    if (data?.id) {
      window.location.href = `/admin/remates/${data.id}`;
    }
  }

  const badge = (e: PortalRemateRow["estado"]) => {
    const map: Record<typeof e, string> = {
      borrador: "bg-neutral-600",
      publicado: "bg-sky-600",
      en_curso: "bg-emerald-600",
      cerrado: "bg-neutral-800",
    };
    return <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase text-white ${map[e]}`}>{e}</span>;
  };

  const missingDeploy = !isSupabaseConfigured();

  if (missingDeploy) {
    return (
      <div className="max-w-xl py-4">
        <SupabaseDeployWarning compact />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Remates y lotes</h1>
          <p className="mt-1 text-sm text-neutral-400">
            Creá un evento y asociá ítems del inventario Tasaciones como lotes. Después publicá y pasá el remate a
            &quot;en curso&quot; para permitir ofertas en tiempo real.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-lg border border-white/20 px-4 py-2 text-sm font-semibold text-white hover:bg-white/5"
          >
            Refrescar
          </button>
          <button
            type="button"
            onClick={() => void nuevo()}
            className="rounded-lg bg-[#FFC600] px-4 py-2 text-sm font-black text-neutral-900 hover:brightness-105"
          >
            Nuevo remate
          </button>
        </div>
      </div>

      {err ? <p className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">{err}</p> : null}

      <ul className="space-y-2">
        {items.map((r) => (
          <li key={r.id}>
            <Link
              href={`/admin/remates/${r.id}`}
              className="flex flex-col gap-2 rounded-xl border border-white/10 bg-[#141c28] p-4 hover:border-[#33C7E3]/40 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="font-semibold text-white">{r.titulo}</p>
                <p className="text-xs text-neutral-500">
                  Fin: {new Date(r.ends_at).toLocaleString("es-CL")} · id {r.id.slice(0, 8)}…
                </p>
              </div>
              {badge(r.estado)}
            </Link>
          </li>
        ))}
        {!items.length ? <p className="text-neutral-500">Aún no hay remates. Creá el primero arriba.</p> : null}
      </ul>
    </div>
  );
}
