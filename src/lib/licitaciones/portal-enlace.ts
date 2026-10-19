// El enlace a la ficha del proceso en ComprasDominicana.
//
// La ficha del portal se abre por noticeUID (DO1.NTC.n), no por el código
// del expediente, y lic_proceso no guarda el uid. Lo que sí hay es la nota
// «Portal DGCP: https://…noticeUID=…» que deja el importador del MCP. Si no
// está (procesos creados a mano o antiguos), se resuelve con la DGCP y se
// escribe esa misma nota: la siguiente vez sale directo.

import { obtenerProceso as procesoDgcp } from "@/lib/dgcp/api";
import { abrirSesion, avisoPorCodigo, uidDe, urlFicha } from "@/lib/dgcp/portal-busqueda";

/** La ficha del portal a partir de las notas; null si no hay noticeUID. */
export function fichaEnNotas(notas: string | null | undefined): string | null {
  const uid = uidDe(notas ?? "");
  return uid ? urlFicha(uid) : null;
}

/** La nota que se añade al resolver el enlace (la misma del importador). */
export function conNotaPortal(notas: string | null | undefined, url: string): string {
  const linea = `Portal DGCP: ${url}`;
  return notas?.trim() ? `${notas.trimEnd()}\n\n${linea}` : linea;
}

/**
 * La ficha del portal de un código de expediente: primero datos abiertos
 * (trae la URL), después el buscador del portal (lo recién publicado que
 * la API aún no tiene). null si ninguno lo encuentra.
 */
export async function resolverFicha(codigo: string): Promise<string | null> {
  try {
    const uid = uidDe((await procesoDgcp(codigo))?.url ?? "");
    if (uid) return urlFicha(uid);
  } catch {
    // La API cae a menudo; queda el portal.
  }
  try {
    const uid = (await avisoPorCodigo(await abrirSesion(), codigo))?.uid;
    if (uid) return urlFicha(uid);
  } catch {
    // Sin portal tampoco: quien llama decide qué mostrar.
  }
  return null;
}
