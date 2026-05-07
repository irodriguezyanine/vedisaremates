/** Aviso cuando el build/deploy no tiene credenciales Supabase visibles para Next.js. */
export function SupabaseDeployWarning({ compact }: { compact?: boolean }) {
  const cls = compact ? "my-6 text-sm" : "mx-auto mt-10 max-w-xl px-4";
  return (
    <div
      className={`rounded-xl border border-amber-400/60 bg-amber-50 px-5 py-4 text-amber-950 ${cls}`}
      role="status"
    >
      <p className="font-bold">No llegan la URL ni la anon key de Supabase a este build.</p>
      <p className="mt-3 text-neutral-800">
        Este proyecto acepta <strong>mismos nombres que Vite</strong> (
        <code className="rounded bg-black/10 px-1 font-mono text-xs">VITE_SUPABASE_URL</code>,{" "}
        <code className="rounded bg-black/10 px-1 font-mono text-xs">VITE_SUPABASE_ANON_KEY</code>) porque{" "}
        <code className="font-mono text-xs">next.config.ts</code> las replica a{" "}
        <code className="rounded bg-black/10 px-1 font-mono text-xs">NEXT_PUBLIC_*</code> para el navegador.
      </p>
      <ol className="mt-4 list-inside list-decimal space-y-2 text-neutral-800">
        <li>
          En <strong>Vercel</strong> → proyecto de <strong>este sitio Next</strong> → <strong>Environment Variables</strong>
          .
        </li>
        <li>
          Confirmá que <code className="font-mono text-xs">VITE_SUPABASE_URL</code> y{" "}
          <code className="font-mono text-xs">VITE_SUPABASE_ANON_KEY</code> (o bien las variantes{" "}
          <code className="font-mono text-xs">NEXT_PUBLIC_SUPABASE_*</code>) estén definidas para{" "}
          <strong>Production</strong>/<strong>Preview</strong>.
        </li>
        <li>
          <strong>No alcanza</strong> con tenerlas solo en otro proyecto de Vercel: cada app usa el entorno de su propio
          proyecto.
        </li>
        <li>
          Tras cualquier cambio: <strong>Redeploy</strong> (los valores se “hornan” en el bundle al compilar).
        </li>
      </ol>
    </div>
  );
}
