// Agenda de cierres para el panel del Kindle: lo que cierra en los próximos
// días y es de nuestro rubro, lo estemos trabajando o no. Función pura sobre
// la salida del radar (la misma que usa buscar_oportunidades).

import { normalizar, type Oportunidad } from "@/lib/dgcp/relevancia";

/** Días de calendario (hora de RD) que abarca la agenda: 0 = hoy. */
export const DIAS_AGENDA = 5;

// Lo nuestro es sobre todo licenciamiento: con estas coincidencias un
// proceso de relevancia «media» entra en la agenda. Tóner, impresoras o
// sillas («media»/«explorar» por TI genérico) se quedan fuera.
const PALABRAS_LICENCIAS = ["licenci", "suscripcion", "software", "saas", "nube", "cloud"];

// Procedimientos de excepción (PEPU proveedor único, PEEX, PEAC, PEPB…):
// suelen ir dirigidos a alguien concreto, no son para competir.
const esExcepcion = (codigo: string) => codigo.toUpperCase().split("-").some((s) => /^PE[A-Z]{2}$/.test(s));

export interface FilaAgenda {
  codigo: string;
  institucion: string;
  titulo: string;
  cierre: string;
  monto: number | null;
  divisa: string;
  mipyme: boolean;
  socios: string[];
  /** Estado en adjudicado.app, o null si todavía no lo estamos trabajando. */
  en_adjudicado: string | null;
}

export function armarAgenda(
  oportunidades: Oportunidad[],
  enApp: Map<string, { estado: string }>,
  ahora: Date,
): FilaAgenda[] {
  return oportunidades
    .filter((o) => {
      if (!o.cierre || new Date(o.cierre).getTime() <= ahora.getTime()) return false;
      if (o.dias_restantes == null || o.dias_restantes > DIAS_AGENDA) return false;
      if (enApp.has(o.codigo)) return true;
      if (o.bloqueados.length > 0 || esExcepcion(o.codigo)) return false;
      // «licenci» también casa con «licenciatura».
      if (normalizar(o.titulo).includes("licenciatura")) return false;
      return o.nivel === "alta" || (o.nivel === "media" && o.coincidencias.some((c) => PALABRAS_LICENCIAS.includes(c)));
    })
    .map((o) => ({
      codigo: o.codigo,
      institucion: o.institucion,
      titulo: o.titulo.trim(),
      cierre: o.cierre as string,
      monto: o.monto,
      divisa: o.divisa,
      mipyme: o.mipyme,
      socios: o.socios,
      en_adjudicado: enApp.get(o.codigo)?.estado ?? null,
    }))
    .sort((a, b) => new Date(a.cierre).getTime() - new Date(b.cierre).getTime());
}
