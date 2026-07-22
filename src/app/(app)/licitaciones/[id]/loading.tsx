// Silueta de la Bid Room: barra sticky + trabajo a la izquierda y riel del
// expediente a la derecha.

import { Esqueleto } from "@/components/ui";

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-[1200px] space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Esqueleto className="h-6 w-72" />
          <Esqueleto className="h-3.5 w-48" />
        </div>
        <div className="flex gap-2">
          <Esqueleto className="h-9 w-40" />
          <Esqueleto className="h-9 w-20" />
        </div>
      </div>
      <Esqueleto className="h-12 w-full" />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <Esqueleto className="h-52 w-full" />
          <Esqueleto className="h-80 w-full" />
        </div>
        <div className="space-y-5">
          <Esqueleto className="h-40 w-full" />
          <Esqueleto className="h-48 w-full" />
        </div>
      </div>
    </div>
  );
}
