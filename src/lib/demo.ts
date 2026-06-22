// Modo demo: permite ver TODA la interfaz con datos de ejemplo, sin Supabase.
// Se activa con NEXT_PUBLIC_DEMO=1. Las mutaciones se vuelven no-op.

import {
  ESTADO_LABEL,
  ESTADOS,
  FLUJO_ITEM,
  type Bitacora,
  type CanalItem,
  type Institucion,
  type Item,
  type Miembro,
  type Persona,
  type Suplidor,
  type TipoItem,
} from "@/lib/types";
import type { OrdenDetalle } from "@/lib/queries";

// ===== Catálogos reutilizables =====

export function demoSuplidores(): Suplidor[] {
  return [
    {
      id: "sup-ingram",
      nombre: "Ingram Micro",
      canal: "distribuidor",
      notas: "Distribuidor mayorista. Precios sujetos a confirmación de fábrica.",
      contactos: [
        {
          id: "c-ingram-1",
          nombre: "Carlos Méndez",
          rol: "Ejecutivo de cuenta",
          email: "carlos.mendez@ingrammicro.com",
          telefono: "809-555-0142",
        },
        {
          id: "c-ingram-2",
          nombre: "Soporte Ingram",
          rol: "Soporte técnico",
          email: "soporte@ingrammicro.com.do",
          telefono: null,
        },
      ],
    },
    {
      id: "sup-amazon",
      nombre: "Amazon Business",
      canal: "amazon",
      notas: "Cuenta empresarial. Compras directas con tracking.",
      contactos: [
        {
          id: "c-amz-1",
          nombre: "Cuenta empresarial",
          rol: "Soporte de cuenta",
          email: "business@amazon.com",
          telefono: null,
        },
      ],
    },
    {
      id: "sup-microsoft",
      nombre: "Microsoft (directo)",
      canal: "suscripcion",
      notas: "Licenciamiento por volumen / suscripciones.",
      contactos: [
        {
          id: "c-ms-1",
          nombre: "Portal de licencias",
          rol: "VLSC",
          email: "vlsc@microsoft.com",
          telefono: null,
        },
      ],
    },
    {
      id: "sup-techdata",
      nombre: "TechData",
      canal: "distribuidor",
      notas: "Distribuidor. Buen tiempo de respuesta en hardware.",
      contactos: [
        {
          id: "c-td-1",
          nombre: "Ana Pérez",
          rol: "Ejecutiva de ventas",
          email: "ana.perez@techdata.com",
          telefono: "809-555-0199",
        },
      ],
    },
  ];
}

export function demoSuplidorPorNombre(nombre: string | null): Suplidor | null {
  if (!nombre) return null;
  return (
    demoSuplidores().find(
      (s) => s.nombre.toLowerCase() === nombre.toLowerCase(),
    ) ?? null
  );
}

export function demoInstituciones(): Institucion[] {
  return [
    {
      id: "inst-inabie",
      nombre: "INABIE",
      siglas: "INABIE",
      contactos: [
        {
          id: "c-inabie-1",
          nombre: "Lucía Fernández",
          rol: "Encargada de Compras",
          email: "compras@inabie.gob.do",
          telefono: "809-472-1000",
        },
        {
          id: "c-inabie-2",
          nombre: "Depto. Jurídico",
          rol: "Subsanaciones",
          email: "juridico@inabie.gob.do",
          telefono: null,
        },
      ],
    },
    {
      id: "inst-salud",
      nombre: "Ministerio de Salud Pública",
      siglas: "MSP",
      contactos: [
        {
          id: "c-msp-1",
          nombre: "Depto. Adquisiciones",
          rol: "Compras",
          email: "adquisiciones@msp.gob.do",
          telefono: "809-541-3121",
        },
      ],
    },
    {
      id: "inst-pn",
      nombre: "Policía Nacional",
      siglas: "PN",
      contactos: [
        {
          id: "c-pn-1",
          nombre: "Dirección de Compras",
          rol: "DAF",
          email: "compras@policianacional.gob.do",
          telefono: null,
        },
      ],
    },
  ];
}

export function demoInstitucionPorNombre(
  nombre: string | null,
): Institucion | null {
  if (!nombre) return null;
  return (
    demoInstituciones().find(
      (i) => i.nombre.toLowerCase() === nombre.toLowerCase(),
    ) ?? null
  );
}

export function isDemo(): boolean {
  return process.env.NEXT_PUBLIC_DEMO === "1";
}

const ORG_ID = "demo-org-0000-0000-0000-000000000001";

export function demoMiembro(): Miembro {
  return {
    id: "demo-miembro",
    org_id: ORG_ID,
    user_id: "demo-user",
    nombre: "Pablo Holguín",
    rol: "admin",
    created_at: new Date().toISOString(),
    organizacion: {
      id: ORG_ID,
      nombre: "Suministros del Caribe, SRL (demo)",
      created_at: new Date().toISOString(),
    },
  };
}

export function demoMiembros(): Miembro[] {
  const base = demoMiembro();
  return [
    base,
    {
      ...base,
      id: "demo-miembro-2",
      user_id: "demo-user-2",
      nombre: "María Reyes",
      rol: "colaborador",
    },
    {
      ...base,
      id: "demo-miembro-3",
      user_id: "demo-user-3",
      nombre: "Luis Domínguez",
      rol: "colaborador",
    },
  ];
}

// Personas asignables (responsables), derivadas de los miembros.
export function demoPersonas(): Persona[] {
  return demoMiembros().map((m) => ({ id: m.user_id, nombre: m.nombre ?? "—" }));
}

export function demoPersona(id: string | null): Persona | null {
  if (!id) return null;
  return demoPersonas().find((p) => p.id === id) ?? null;
}

// Fecha relativa a hoy en formato YYYY-MM-DD.
function dia(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

function ts(offsetDias: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDias);
  return d.toISOString();
}

let CACHE: OrdenDetalle[] | null = null;

export function demoOrdenes(): OrdenDetalle[] {
  if (CACHE) return CACHE;

  CACHE = [
    {
      id: "demo-1",
      responsable_id: "demo-user-2",
      org_id: ORG_ID,
      numero_oc: "OC-2026-00481",
      institucion: "INABIE",
      codigo_expediente: "INABIE-CCC-LPN-2026-0012",
      monto: 1_850_000,
      moneda: "DOP",
      fecha_oc: dia(-12),
      plazo_entrega: dia(-1), // VENCIDO
      estado: "en_coordinacion",
      suplidor: "Ingram Micro",
      suplidor_estado: "en_transito",
      suplidor_fecha_estim: dia(2),
      metodo_pago: "Transferencia",
      plazo_pago_dias: 45,
      etiquetas: ["urgente", "espera-suplidor"],
      oc_archivo_url: null,
      ocr_raw: null,
      creado_por: "demo-user",
      created_at: ts(-12),
      updated_at: ts(-1),
      item: [
        it("demo-1", 0, "Suscripción Microsoft 365 E3 (anual)", "servicio", 120, true, {
          suplidor: "Microsoft (directo)",
          canal: "suscripcion",
          estado_item: "activado",
          precio: 540000,
          condiciones:
            "Pago anual por transferencia. Activación inmediata tras el pago; sin espera de suplidor.",
        }),
        it("demo-1", 1, "Laptops Dell Latitude 5440 (5 uds.)", "fisico", 5, false, {
          // Repartido entre dos suplidores: 1 por Amazon, 4 por eBay.
          condiciones:
            "Mismo modelo, dos fuentes para cumplir a tiempo. Verificar serie a la recepción.",
          asignaciones: [
            {
              id: "demo-1-item-1-a0",
              suplidor: "Amazon Business",
              canal: "amazon",
              cantidad: 1,
              precio: 82000,
              estado_item: "en_transito",
              fecha_estim: dia(2),
            },
            {
              id: "demo-1-item-1-a1",
              suplidor: "eBay (vendedor PCWorld)",
              canal: "directo",
              cantidad: 4,
              precio: 320000,
              estado_item: "pedido",
              fecha_estim: dia(7),
            },
          ],
        }),
        it("demo-1", 2, "Licencias antivirus corporativo (200 equipos)", "licencia", 200, false, {
          suplidor: "Ingram Micro",
          canal: "distribuidor",
          estado_item: "negociando",
          fecha_estim: dia(6),
          precio: 890000,
          condiciones:
            "Esperando confirmación de fábrica. Negociando precio por volumen + 1 año de soporte. Tope aprobado: RD$ 920k.",
          coordinacion: [
            bit("demo-1-i2", 0, "correo", "Solicité cotización a Ingram por 200 licencias + soporte 1 año.", -5, "demo-user-2"),
            bit("demo-1-i2", 1, "llamada", "El distribuidor confirma stock, pero el precio final depende de fábrica. Prometen respuesta en 48 h.", -3, "demo-user-2"),
            bit("demo-1-i2", 2, "nota", "Si el precio sube más de 10%, escalar a gerencia antes de aprobar la compra.", -2, "demo-user"),
          ],
        }),
      ],
      bitacora: [
        bit("demo-1", 0, "llamada", "Llamé a la encargada de compras; confirman que la subsanación se aceptó. Falta el acta de inicio.", -1),
        bit("demo-1", 1, "correo", "Enviado correo solicitando los datos para facturación.", -3),
        bit("demo-1", 2, "suplidor", "Ingram confirma despacho parcial; las licencias E3 ya activadas.", -2),
      ],
      documento: [],
    },
    {
      id: "demo-2",
      responsable_id: "demo-user",
      org_id: ORG_ID,
      numero_oc: "OC-2026-00455",
      institucion: "Ministerio de Salud Pública",
      codigo_expediente: "MSP-DAF-CM-2026-0098",
      monto: 640_000,
      moneda: "DOP",
      fecha_oc: dia(-5),
      plazo_entrega: dia(3), // ámbar
      estado: "orden_recibida",
      suplidor: null,
      suplidor_estado: null,
      suplidor_fecha_estim: null,
      metodo_pago: null,
      plazo_pago_dias: 30,
      etiquetas: [],
      oc_archivo_url: null,
      ocr_raw: null,
      creado_por: "demo-user",
      created_at: ts(-5),
      updated_at: ts(-5),
      item: [
        it("demo-2", 0, "Switches Cisco Catalyst 1000 (8 unidades)", "fisico", 8, false),
        it("demo-2", 1, "Instalación y configuración de red", "servicio", 1, false),
      ],
      bitacora: [
        bit("demo-2", 0, "nota", "Orden recién recibida. Hay que cotizar con el distribuidor y fijar fecha de entrega.", 0),
      ],
      documento: [],
    },
    {
      id: "demo-3",
      responsable_id: "demo-user-3",
      org_id: ORG_ID,
      numero_oc: "OC-2026-00390",
      institucion: "Policía Nacional",
      codigo_expediente: "PN-DAF-LPN-2026-0044",
      monto: 2_300_000,
      moneda: "DOP",
      fecha_oc: dia(-22),
      plazo_entrega: dia(-8),
      estado: "entregado", // ATASCADO sin facturar
      suplidor: "TechData",
      suplidor_estado: "recibido",
      suplidor_fecha_estim: dia(-10),
      metodo_pago: "Transferencia",
      plazo_pago_dias: 60,
      etiquetas: ["espera-acta"],
      oc_archivo_url: null,
      ocr_raw: null,
      creado_por: "demo-user",
      created_at: ts(-22),
      updated_at: ts(-7),
      item: [
        it("demo-3", 0, "Laptops Dell Latitude (30 unidades)", "fisico", 30, true),
        it("demo-3", 1, "Mochilas antichoque", "fisico", 30, true),
      ],
      bitacora: [
        bit("demo-3", 0, "llamada", "Entrega completada en el almacén central. Esperando que nos devuelvan el acta firmada para poder facturar.", -7),
      ],
      documento: [],
    },
    {
      id: "demo-4",
      responsable_id: "demo-user-2",
      org_id: ORG_ID,
      numero_oc: "OC-2026-00372",
      institucion: "Ayuntamiento del Distrito Nacional",
      codigo_expediente: "ADN-CM-2026-0210",
      monto: 415_000,
      moneda: "DOP",
      fecha_oc: dia(-30),
      plazo_entrega: dia(-18),
      estado: "facturado", // POR COBRAR
      suplidor: "Ingram Micro",
      suplidor_estado: "recibido",
      suplidor_fecha_estim: dia(-20),
      metodo_pago: "Cheque",
      plazo_pago_dias: 30,
      etiquetas: [],
      oc_archivo_url: null,
      ocr_raw: null,
      creado_por: "demo-user",
      created_at: ts(-30),
      updated_at: ts(-6),
      item: [
        it("demo-4", 0, "Suscripción Adobe Creative Cloud (10 licencias)", "licencia", 10, true),
      ],
      bitacora: [
        bit("demo-4", 0, "nota", "Facturado en Odoo (NCF emitido). En espera del pago a 30 días.", -6),
      ],
      documento: [],
    },
    {
      id: "demo-5",
      responsable_id: "demo-user",
      org_id: ORG_ID,
      numero_oc: "OC-2026-00310",
      institucion: "INTRANT",
      codigo_expediente: "INTRANT-CM-2026-0150",
      monto: 980_000,
      moneda: "DOP",
      fecha_oc: dia(-60),
      plazo_entrega: dia(-45),
      estado: "cobrado",
      suplidor: "TechData",
      suplidor_estado: "recibido",
      suplidor_fecha_estim: dia(-50),
      metodo_pago: "Transferencia",
      plazo_pago_dias: 45,
      etiquetas: [],
      oc_archivo_url: null,
      ocr_raw: null,
      creado_por: "demo-user",
      created_at: ts(-60),
      updated_at: ts(-3),
      item: [
        it("demo-5", 0, "Servidores Dell PowerEdge (2 unidades)", "fisico", 2, true),
      ],
      bitacora: [
        bit("demo-5", 0, "nota", "Pago recibido. Orden cerrada.", -3),
      ],
      documento: [],
    },
  ];

  return CACHE;
}

export function demoOrden(id: string): OrdenDetalle | null {
  return demoOrdenes().find((o) => o.id === id) ?? null;
}

function diasAtras(iso: string): number {
  return Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

// Eventos del sistema sintéticos para que el timeline cuente toda la historia.
function eventosDe(o: OrdenDetalle): Bitacora[] {
  const ev: Bitacora[] = [];
  const creado = -diasAtras(o.created_at);
  const actualizado = -diasAtras(o.updated_at);
  const medio = Math.round((creado + actualizado) / 2);
  const resp = demoPersona(o.responsable_id);

  const push = (n: number, texto: string, autorId: string, off: number) =>
    ev.push({
      id: `${o.id}-ev-${n}`,
      orden_id: o.id,
      autor_id: autorId,
      tipo: "evento",
      texto,
      created_at: ts(off),
    });

  push(0, "Creó la orden a partir de la OC.", o.creado_por ?? "demo-user", creado);
  if (resp) push(1, `Asignó la orden a ${resp.nombre}.`, "demo-user", creado);

  const idx = ESTADOS.indexOf(o.estado);
  if (idx >= 1)
    push(
      2,
      `Avanzó la orden a ${ESTADO_LABEL[o.estado]}.`,
      o.responsable_id ?? "demo-user",
      medio,
    );

  const entregado = o.item.find((i) => i.entregado);
  if (entregado)
    push(
      3,
      `Marcó entregado: ${entregado.nombre}.`,
      o.responsable_id ?? "demo-user",
      actualizado,
    );

  o.etiquetas.forEach((e, i) =>
    push(
      4 + i,
      `Agregó el marcador “${e}”.`,
      o.responsable_id ?? "demo-user",
      medio,
    ),
  );

  return ev;
}

// Documentos sintéticos por orden (para poblar el repositorio global).
export function documentosDe(o: OrdenDetalle): import("@/lib/types").Documento[] {
  const idx = ESTADOS.indexOf(o.estado);
  const at = (off: number) => ts(off);
  const creado = -diasAtras(o.created_at);
  const actualizado = -diasAtras(o.updated_at);
  const medio = Math.round((creado + actualizado) / 2);

  const docs: import("@/lib/types").Documento[] = [];
  const doc = (
    n: number,
    nombre: string,
    tipo: string,
    off: number,
  ): import("@/lib/types").Documento => ({
    id: `${o.id}-doc-${n}`,
    orden_id: o.id,
    nombre,
    tipo,
    archivo_url: `demo/${o.id}/${n}`,
    subido_por: o.creado_por,
    created_at: at(off),
  });

  docs.push(doc(0, `OC ${o.numero_oc}.pdf`, "oc", creado));
  if (o.item.some((i) => i.tipo === "licencia"))
    docs.push(doc(1, "Carta del fabricante.pdf", "carta_fabricante", medio));
  if (idx >= ESTADOS.indexOf("entregado"))
    docs.push(doc(2, "Acta de entrega.pdf", "acta", actualizado));
  if (idx >= ESTADOS.indexOf("facturado"))
    docs.push(doc(3, `Factura ${o.numero_oc}.pdf`, "factura", actualizado));
  return docs;
}

// Bitácora del detalle en demo: notas manuales + eventos, con autor resuelto.
export function bitacoraDemo(o: OrdenDetalle): Bitacora[] {
  return [...o.bitacora, ...eventosDe(o)]
    .map((b) => ({ ...b, autor: demoPersona(b.autor_id) }))
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
}

function canalPorDefecto(tipo: TipoItem): CanalItem {
  if (tipo === "servicio") return "suscripcion";
  if (tipo === "licencia") return "distribuidor";
  return "directo";
}

type ItemExtra = Partial<
  Pick<
    Item,
    | "suplidor"
    | "canal"
    | "estado_item"
    | "fecha_estim"
    | "precio"
    | "condiciones"
    | "coordinacion"
    | "asignaciones"
  >
>;

// Resuelve los autores de la coordinación de cada ítem (demo).
export function itemsDemo(o: OrdenDetalle): Item[] {
  return o.item.map((it) =>
    it.coordinacion
      ? {
          ...it,
          coordinacion: it.coordinacion.map((b) => ({
            ...b,
            autor: demoPersona(b.autor_id),
          })),
        }
      : it,
  );
}

function it(
  ordenId: string,
  i: number,
  nombre: string,
  tipo: TipoItem,
  cantidad: number,
  entregado: boolean,
  extra: ItemExtra = {},
): Item {
  const flujo = FLUJO_ITEM[tipo];
  const terminal = flujo[flujo.length - 1].key;
  return {
    id: `${ordenId}-item-${i}`,
    orden_id: ordenId,
    nombre,
    tipo,
    cantidad,
    entregado,
    fecha_entrega: entregado ? dia(-2) : null,
    notas: null,
    orden_indice: i,
    suplidor: extra.suplidor ?? null,
    canal: extra.canal ?? canalPorDefecto(tipo),
    estado_item: extra.estado_item ?? (entregado ? terminal : flujo[0].key),
    fecha_estim: extra.fecha_estim ?? null,
    precio: extra.precio ?? null,
    condiciones: extra.condiciones ?? null,
    coordinacion: extra.coordinacion,
    asignaciones: extra.asignaciones,
  };
}

function bit(
  ordenId: string,
  i: number,
  tipo: Bitacora["tipo"],
  texto: string,
  offsetDias: number,
  autorId = "demo-user",
): Bitacora {
  return {
    id: `${ordenId}-bit-${i}`,
    orden_id: ordenId,
    autor_id: autorId,
    tipo,
    texto,
    created_at: ts(offsetDias),
  };
}
