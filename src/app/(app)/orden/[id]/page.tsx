import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Building2, Truck, Contact, type LucideIcon } from "lucide-react";
import {
  obtenerOrden,
  listarPersonas,
  listarSuplidores,
  institucionPorNombre,
} from "@/lib/queries";
import { getMiembro } from "@/lib/auth";
import { Panel, SectionTitle } from "@/components/ui";
import { ContactList } from "@/components/contacts";
import {
  diasRestantes,
  ESTADO_LABEL,
  formatFecha,
  formatRD,
  nivelUrgencia,
  relojEntregaActivo,
} from "@/lib/types";
import { estadoChip, textoDias, urgenciaChip } from "@/lib/ui";
import { itemEntregado } from "@/lib/types";
import EstadoControl from "./_components/EstadoControl";
import Stepper from "./_components/Stepper";
import ItemsPanel from "./_components/ItemsPanel";
import BitacoraPanel from "./_components/BitacoraPanel";
import DocumentosPanel from "./_components/DocumentosPanel";
import PlazosPanel from "./_components/PlazosPanel";
import ResponsableControl from "./_components/ResponsableControl";
import ColaboradoresControl from "./_components/ColaboradoresControl";
import MarcadoresControl from "./_components/MarcadoresControl";
import ActividadProvider from "./_components/Actividad";

export const dynamic = "force-dynamic";

export default async function OrdenDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const orden = await obtenerOrden(id);
  if (!orden) notFound();

  const diasEntrega = diasRestantes(orden.plazo_entrega);

  // Roll-up de suplidores: el ítem pendiente que llega más tarde marca el riesgo.
  const itemsListos = orden.item.filter(itemEntregado).length;
  const pendientesConEta = orden.item.filter(
    (it) => !itemEntregado(it) && it.fecha_estim,
  );
  const itemMasTarde = pendientesConEta.reduce<(typeof pendientesConEta)[number] | null>(
    (m, it) => (!m || (it.fecha_estim ?? "") > (m.fecha_estim ?? "") ? it : m),
    null,
  );
  const diasSuplidor = diasRestantes(itemMasTarde?.fecha_estim ?? null);

  const personas = await listarPersonas();
  const suplidores = await listarSuplidores();
  const institucion = await institucionPorNombre(orden.institucion);
  const miembro = await getMiembro();
  const currentUser = {
    id: miembro?.user_id ?? "yo",
    nombre: miembro?.nombre ?? "Tú",
  };

  return (
    <ActividadProvider currentUser={currentUser} suplidores={suplidores}>
      <div className="space-y-5">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-[13px] text-muted transition-colors hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={2} aria-hidden />
          Tablero
        </Link>

      {/* Cabecera */}
      <div className="rounded-lg border border-line bg-surface p-5 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <h1 className="font-mono text-2xl font-semibold tracking-tight text-ink">
                {orden.numero_oc || "OC sin número"}
              </h1>
              <span
                className={`rounded px-2 py-0.5 text-xs font-medium ${estadoChip(
                  orden.estado,
                )}`}
              >
                {ESTADO_LABEL[orden.estado]}
              </span>
            </div>
            <p className="mt-1 text-sm text-ink-soft">
              {orden.institucion || "Institución por confirmar"}
            </p>
            {orden.codigo_expediente && (
              <p className="mt-0.5 font-mono text-xs text-muted">
                {orden.codigo_expediente}
              </p>
            )}
          </div>
          <div className="text-right">
            <p className="font-mono text-2xl font-semibold tracking-tight text-ink">
              {formatRD(orden.monto, orden.moneda)}
            </p>
            <p className="text-[11px] uppercase tracking-wide text-muted">
              Monto adjudicado
            </p>
          </div>
        </div>

        {/* Propiedades de la orden */}
        <div className="mt-4 flex flex-wrap items-start gap-x-8 gap-y-3 border-t border-line pt-4">
          <Prop label="Responsable">
            <ResponsableControl
              ordenId={orden.id}
              responsable={orden.responsable ?? null}
              personas={personas}
            />
          </Prop>
          <Prop label="Colaboradores">
            <ColaboradoresControl
              ordenId={orden.id}
              colaboradores={orden.colaboradoresPersonas ?? []}
              responsableId={orden.responsable_id}
              personas={personas}
            />
          </Prop>
          <Prop label="Marcadores">
            <MarcadoresControl ordenId={orden.id} etiquetas={orden.etiquetas} />
          </Prop>
        </div>

        {/* Dos relojes */}
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Reloj
            icon={Building2}
            titulo="Institución · entrega"
            detalle={
              relojEntregaActivo(orden.estado)
                ? `Vence ${formatFecha(orden.plazo_entrega)}`
                : "Entregado"
            }
            dias={relojEntregaActivo(orden.estado) ? diasEntrega : null}
            inactivo={!relojEntregaActivo(orden.estado)}
          />
          <Reloj
            icon={Truck}
            titulo="Suplidores (roll-up de ítems)"
            detalle={
              itemMasTarde
                ? `${itemsListos}/${orden.item.length} listos · espera: ${itemMasTarde.nombre}`
                : `${itemsListos}/${orden.item.length} ítems listos`
            }
            dias={diasSuplidor}
            inactivo={!itemMasTarde}
          />
        </div>
      </div>

      {/* Estado + stepper */}
      <div className="rounded-lg border border-line bg-surface p-5 shadow-card">
        <Stepper estado={orden.estado} />
        <div className="mt-4 border-t border-line pt-4">
          <EstadoControl ordenId={orden.id} estado={orden.estado} />
        </div>
      </div>

      <ItemsPanel
        ordenId={orden.id}
        items={orden.item}
        currentUser={currentUser}
      />

      {institucion && institucion.contactos.length > 0 && (
        <Panel>
          <SectionTitle icon={Contact}>
            Institución · {institucion.nombre}
          </SectionTitle>
          <div className="px-4">
            <ContactList contactos={institucion.contactos} />
          </div>
        </Panel>
      )}

      <BitacoraPanel
        ordenId={orden.id}
        entradas={orden.bitacora}
        currentUser={currentUser}
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <DocumentosPanel
          ordenId={orden.id}
          documentos={orden.documento}
          ocArchivo={orden.oc_archivo_url}
        />
        <PlazosPanel ordenId={orden.id} orden={orden} />
      </div>
      </div>
    </ActividadProvider>
  );
}

function Prop({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted">
        {label}
      </p>
      {children}
    </div>
  );
}

function Reloj({
  icon: Icon,
  titulo,
  detalle,
  dias,
  inactivo,
}: {
  icon: LucideIcon;
  titulo: string;
  detalle: string;
  dias: number | null;
  inactivo: boolean;
}) {
  const nivel = inactivo ? "neutro" : nivelUrgencia(dias);
  return (
    <div className="flex items-center gap-3 rounded-md border border-line bg-canvas px-4 py-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-surface-2 text-muted">
        <Icon className="h-4.5 w-4.5" strokeWidth={2} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
          {titulo}
        </p>
        <p className="truncate text-[13px] text-ink-soft">{detalle}</p>
      </div>
      <span
        className={`shrink-0 rounded px-2 py-1 font-mono text-xs font-semibold ${urgenciaChip(
          nivel,
        )}`}
      >
        {inactivo ? "—" : textoDias(dias)}
      </span>
    </div>
  );
}
