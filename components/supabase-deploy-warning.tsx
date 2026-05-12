export function SupabaseDeployWarning({ compact }: { compact?: boolean }) {
  const cls = compact ? "my-6 text-sm" : "mx-auto mt-10 max-w-xl px-4";
  return (
    <div
      className={`rounded-xl border border-amber-400/60 bg-amber-50 px-5 py-4 text-amber-950 ${cls}`}
      role="status"
    >
      <p className="font-bold">Este servicio no está disponible temporalmente.</p>
      <p className="mt-3 text-neutral-800">
        Estamos trabajando para restablecerlo. Por favor, intenta nuevamente en unos minutos.
      </p>
    </div>
  );
}
