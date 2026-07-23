import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Building2, Truck, Contact, Info, type LucideIcon } from "lucide-react";
import {
  obtenerOrden,
  listarPersonas,
  listarSuplidores,
  listarGrupos,
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
  nombreLegible,
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
import EditarOrden from "./_components/EditarOrden";
import ResponsableControl from "./_components/ResponsableControl";
import ColaboradoresControl from "./_components/ColaboradoresControl";
import MarcadoresControl from "./_components/MarcadoresControl";
import GrupoControl from "./_components/GrupoControl";
import OdooSync from "./_components/OdooSync";
import BuzonOrden from "./_components/BuzonOrden";
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

  const [personas, suplidores, grupos, institucion, miembro] = await Promise.all([
    listarPersonas(),
    listarSuplidores(),
    listarGrupos(),
    institucionPorNombre(orden.institucion),
    getMiembro(),
  ]);
  const currentUser = {
    id: miembro?.user_id ?? "yo",
    nombre: miembro?.nombre ? nombreLegible(miembro.nombre) : "Tú",
  };

  return (
    <ActividadProvider
      ordenId={orden.id}
      currentUser={currentUser}
      suplidores={suplidores}
    >
      <div className="mx-auto w-full max-w-[1200px] space-y-5">
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
          <div className="flex flex-col items-end gap-2.5">
            <EditarOrden
              ordenId={orden.id}
              inicial={{
                numero_oc: orden.numero_oc ?? "",
                institucion: orden.institucion ?? "",
                codigo_expediente: orden.codigo_expediente ?? "",
                moneda: orden.moneda === "USD" ? "USD" : "DOP",
                monto: orden.monto != null ? String(orden.monto) : "",
                fecha_oc: orden.fecha_oc ?? "",
                plazo_entrega: orden.plazo_entrega ?? "",
              }}
            />
            <div className="text-right">
              <p className="font-mono text-2xl font-semibold tracking-tight text-ink">
                {formatRD(orden.monto, orden.moneda)}
              </p>
              <p className="text-[11px] uppercase tracking-wide text-muted">
                Monto adjudicado
              </p>
            </div>
          </div>
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

      {/* Workspace: columna principal (trabajo) + riel lateral (consulta).
          En desktop el riel va a la derecha, pegajoso. En móvil el riel se
          intercala DESPUÉS del estado y ANTES de ítems/bitácora — antes caía
          al fondo de la página y los detalles quedaban inaccesibles. */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3 lg:items-start">
        <div className="order-1 space-y-5 lg:col-span-2">
          <div className="rounded-lg border border-line bg-surface p-5 shadow-card">
            <Stepper estado={orden.estado} />
            <div className="mt-4 border-t border-line pt-4">
              <EstadoControl ordenId={orden.id} estado={orden.estado} />
            </div>
          </div>
        </div>

        <div className="order-3 space-y-5 lg:col-span-2 lg:col-start-1">
          <ItemsPanel
            ordenId={orden.id}
            items={orden.item}
            currentUser={currentUser}
          />

          <BitacoraPanel
            ordenId={orden.id}
            entradas={orden.bitacora}
            currentUser={currentUser}
            personas={personas}
          />
        </div>

        {/* Riel lateral: detalles, plazos, documentos, contactos. Pegajoso. */}
        <aside className="order-2 space-y-5 lg:sticky lg:top-6 lg:col-start-3 lg:row-span-2 lg:row-start-1 lg:self-start">
          <Panel>
            <SectionTitle icon={Info}>Detalles</SectionTitle>
            <div className="space-y-3.5 px-4 pb-4">
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
              <Prop label="Grupo">
                <GrupoControl
                  ordenId={orden.id}
                  grupoId={orden.grupo_id ?? null}
                  grupos={grupos}
                />
              </Prop>
              <Prop label="Marcadores">
                <MarcadoresControl ordenId={orden.id} etiquetas={orden.etiquetas} />
              </Prop>
            </div>
          </Panel>
          <PlazosPanel ordenId={orden.id} orden={orden} />
          <OdooSync
            ordenId={orden.id}
            numeroOc={orden.numero_oc ?? ""}
            facturaEstado={orden.odoo_factura_estado ?? null}
            facturaId={orden.odoo_factura_id ?? null}
            facturaNombre={orden.odoo_factura_nombre ?? null}
            ordenVentaId={orden.odoo_orden_id ?? null}
            ordenVentaNombre={orden.odoo_orden_nombre ?? null}
          />
          <BuzonOrden
            buzon={orden.buzon ?? null}
            dominio={process.env.INBOUND_DOMAIN ?? null}
          />
          <DocumentosPanel
            ordenId={orden.id}
            documentos={orden.documento}
            ocArchivo={orden.oc_archivo_url}
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
        </aside>
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
