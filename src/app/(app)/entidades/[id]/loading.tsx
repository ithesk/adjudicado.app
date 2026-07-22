// Silueta de la ficha de entidad: perfil con logo + contactos y riel.

import { Esqueleto, Hoja } from "@/components/ui";

export default function Loading() {
  return (
    <Hoja ancho="ficha" className="space-y-4">
      <div className="flex items-center gap-2">
        <Esqueleto className="h-6 w-6 rounded-md" />
        <Esqueleto className="h-6 w-80" />
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <div className="flex gap-4 rounded-lg border border-line bg-surface p-4 shadow-card">
            <Esqueleto className="h-20 w-20 rounded-lg" />
            <div className="flex-1 space-y-2.5">
              <Esqueleto className="h-8 w-full" />
              <Esqueleto className="h-8 w-full" />
              <Esqueleto className="h-8 w-2/3" />
            </div>
          </div>
          <Esqueleto className="h-64 w-full" />
        </div>
        <div className="space-y-5">
          <Esqueleto className="h-36 w-full" />
          <Esqueleto className="h-64 w-full" />
        </div>
      </div>
    </Hoja>
  );
}
