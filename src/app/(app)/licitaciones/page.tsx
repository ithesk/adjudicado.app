import Link from "next/link";
import { Plus } from "lucide-react";
import { listarProcesos, perfilEmpresa } from "@/lib/licitaciones/queries";
import { btnPrimary } from "@/components/ui";
import ProcesosLista from "./ProcesosLista";

export const dynamic = "force-dynamic";

export default async function LicitacionesPage() {
  const [procesos, perfil] = await Promise.all([listarProcesos(), perfilEmpresa()]);

  return (
    <div className="space-y-4">
      {!perfil && (
        <p className="rounded-md bg-warn-soft px-3 py-2 text-[13px] text-warn">
          Configura primero los datos de la empresa (RNC, RPE, tasa y margen) en
          la pestaña <Link href="/configuracion/empresa" className="font-medium underline">Empresa</Link> —
          el expediente los necesita para generar los documentos.
        </p>
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">
          {procesos.length === 0
            ? "Sin procesos todavía."
            : `${procesos.length} proceso${procesos.length === 1 ? "" : "s"}.`}
        </p>
        <Link href="/licitaciones/nuevo" className={btnPrimary()}>
          <Plus className="h-4 w-4" strokeWidth={2.4} aria-hidden />
          Nuevo proceso
        </Link>
      </div>

      <ProcesosLista procesos={procesos} />
    </div>
  );
}
