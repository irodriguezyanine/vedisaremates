import { Suspense } from "react";

import { BuscarInventario } from "@/components/buscar-inventario";

function BuscarFallback() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="h-8 w-64 animate-pulse rounded bg-neutral-200" />
      <div className="mt-4 h-4 max-w-xl animate-pulse rounded bg-neutral-100" />
    </div>
  );
}

export default function BuscarPage() {
  return (
    <Suspense fallback={<BuscarFallback />}>
      <BuscarInventario />
    </Suspense>
  );
}
