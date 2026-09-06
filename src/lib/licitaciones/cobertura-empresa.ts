// Qué requisitos del pliego los cubre un documento de la EMPRESA, resuelto
// SIEMPRE contra lo que está vigente HOY.
//
// Antes esto se congelaba: `lic_requisito.documento_empresa_id` se escribía una
// sola vez, el día que se agregaba el requisito desde el checklist, y nadie lo
// volvía a mirar. Dos consecuencias, las dos malas:
//
//   - Subir el certificado DESPUÉS de cargar el checklist dejaba el requisito
//     en «Falta en Empresa» para siempre; el único arreglo era borrarlo y
//     volver a agregarlo.
//   - Peor: renovar un certificado es subir una fila NUEVA (así se conserva el
//     historial, es deliberado). El requisito seguía apuntando a la fila
//     anterior, así que el paquete salía con el documento VENCIDO y el
//     semáforo en verde. Al duplicar un proceso, el id viejo se copiaba tal
//     cual y el problema viajaba con él.
//
// El vínculo real es el TIPO de documento, no una fila concreta: por eso se
// resuelve al leer y al generar. `documento_empresa_id` se sigue escribiendo,
// pero ya solo como rastro de con qué nació el requisito.
//
// Sin imports de servidor: se usa desde componentes cliente y servidor.

import { estadoDocumentacion, type DocumentoEmpresa } from "@/lib/empresa/documentos";
import { requisitoEstandar } from "./requisitos-estandar";

export interface Cobertura {
  /** Tipo del catálogo de documentos de empresa que satisface el requisito. */
  tipo: string;
  /** El documento que cuenta hoy. null = nunca se cargó. */
  id: string | null;
  nombre: string | null;
  archivo_url: string | null;
  /** Días para el vencimiento; null = no vence o no hay documento. */
  dias: number | null;
  /** Hay documento, pero se pasó de fecha. */
  vencido: boolean;
}

/** Serializable: cruza la frontera servidor → cliente tal cual. */
export type MapaCobertura = Record<string, Cobertura>;

/** El tipo de documento de empresa que satisface este requisito, si alguno. */
export function tipoQueCubre(codigo: string): string | undefined {
  return requisitoEstandar(codigo)?.docEmpresa;
}

// Una entrada por tipo del catálogo que tenga documento cargado, con el mismo
// criterio de «vigente» que la pantalla Empresa (el de vencimiento más lejano).
export function coberturaPorTipo(docs: DocumentoEmpresa[]): MapaCobertura {
  const mapa: MapaCobertura = {};
  for (const f of estadoDocumentacion(docs)) {
    if (!f.vigente) continue;
    // Los "otro" generan una fila por documento y comparten código: no
    // cubren requisitos, así que no entran (y no se pisan entre ellos).
    if (f.tipo.codigo === "otro") continue;
    mapa[f.tipo.codigo] = {
      tipo: f.tipo.codigo,
      id: f.vigente.id,
      nombre: f.vigente.nombre,
      archivo_url: f.vigente.archivo_url,
      dias: f.dias,
      vencido: f.nivel === "vencido",
    };
  }
  return mapa;
}

/** La cobertura VIVA de un requisito: null si no lo cubre ningún documento. */
export function coberturaDeRequisito(
  codigo: string,
  mapa: MapaCobertura,
): Cobertura | null {
  const tipo = tipoQueCubre(codigo);
  if (!tipo) return null;
  return mapa[tipo] ?? { tipo, id: null, nombre: null, archivo_url: null, dias: null, vencido: false };
}

/** Cubierto de verdad: hay documento y no está vencido. */
export function estaCubierto(codigo: string, mapa: MapaCobertura): boolean {
  const c = coberturaDeRequisito(codigo, mapa);
  return !!c && !!c.archivo_url && !c.vencido;
}

/** La ruta en storage del documento de empresa que va al paquete por este
 *  requisito. Un documento VENCIDO no se anexa: el índice lo declara como
 *  faltante y el checklist lo marca en rojo — mejor eso que presentar en la
 *  apertura un certificado caducado creyendo que está al día. */
export function rutaDeEmpresa(codigo: string, mapa: MapaCobertura): string | null {
  const c = coberturaDeRequisito(codigo, mapa);
  return c && !c.vencido ? c.archivo_url : null;
}
