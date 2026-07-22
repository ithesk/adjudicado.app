// Silueta de la ficha de orden: principal + riel (misma geometría que
// DisposicionFicha) para que el salto al contenido real sea mínimo.

import { Esqueleto, Hoja } from "@/components/ui";

export default function Loading() {
  return (
    <Hoja ancho="ficha" className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Esqueleto className="h-6 w-64" />
          <Esqueleto className="h-3.5 w-40" />
        </div>
        <Esqueleto className="h-9 w-36" />
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <Esqueleto className="h-44 w-full" />
          <Esqueleto className="h-72 w-full" />
        </div>
        <div className="space-y-5">
          <Esqueleto className="h-32 w-full" />
          <Esqueleto className="h-56 w-full" />
        </div>
      </div>
    </Hoja>
  );
}
