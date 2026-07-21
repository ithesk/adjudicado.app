import Link from "next/link";
import { Plus } from "lucide-react";
import { listarProcesos, perfilEmpresa, subsanacionesAbiertas } from "@/lib/licitaciones/queries";
import { listarEntidadesLigero } from "@/lib/entidades/queries";
import { CabeceraPagina, Hoja, btnPrimary } from "@/components/ui";
import ProcesosLista from "./ProcesosLista";

export const dynamic = "force-dynamic";

export default async function LicitacionesPage() {
  const [procesos, perfil, subsanaciones, entidades] = await Promise.all([
    listarProcesos(),
    perfilEmpresa(),
    subsanacionesAbiertas(),
    listarEntidadesLigero(),
  ]);
  const entidadPorId = Object.fromEntries(
    entidades.map((e) => [e.id, { nombre: e.nombre, siglas: e.siglas }]),
  );

  return (
    <Hoja ancho="ficha" className="space-y-4">
      <CabeceraPagina
        titulo="Licitaciones"
        descripcion={
          procesos.length === 0
            ? "El expediente de cada proceso — de la convocatoria al paquete listo para someter."
            : `${procesos.length} proceso${procesos.length === 1 ? "" : "s"} — de la convocatoria al paquete listo para someter.`
        }
        acciones={
          <Link href="/licitaciones/nuevo" className={btnPrimary()}>
            <Plus className="h-4 w-4" strokeWidth={2.4} aria-hidden />
            Nuevo proceso
          </Link>
        }
      />

      {!perfil && (
        <p className="rounded-md bg-warn-soft px-3 py-2 text-[13px] text-warn">
          Configura primero los datos de la empresa (RNC, RPE, tasa y margen) en
          la pestaña <Link href="/configuracion/empresa" className="font-medium underline">Empresa</Link> —
          el expediente los necesita para generar los documentos.
        </p>
      )}

      <ProcesosLista
        procesos={procesos}
        subsanaciones={subsanaciones}
        entidades={entidadPorId}
      />
    </Hoja>
  );
}
