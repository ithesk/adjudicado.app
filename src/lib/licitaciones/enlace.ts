// El HILO entre una licitación y su orden de compra: el código de expediente.
//
// Lo pone el Estado, no nosotros, y viaja intacto desde el pliego hasta la
// orden de compra que llega por correo semanas después. Es el único
// identificador común a las dos mitades del negocio.
//
// La peculiaridad del negocio manda en el diseño: una licitación se puede
// haber trabajado FUERA de este sistema (en el portal, en otra herramienta, o
// por otra persona) y aun así su orden de compra llega igual. Por eso el
// enlace NO es «al adjudicar, crea la orden» —eso solo cubre el camino de
// ida— sino «cuando aparezca una orden, búscale su licitación si es que la
// hay». Una orden sin licitación registrada es un caso legítimo y frecuente,
// no un error: hoy son 28 de 33.
//
// Módulo puro (sin imports de servidor): testeable y usable en cliente.

/** Un proceso, reducido a lo que hace falta para cruzarlo. */
export interface ProcesoParaEnlace {
  id: string;
  codigo: string;
  estado: string;
}

// El mismo expediente se escribe de formas distintas en el pliego y en la
// orden de compra: mayúsculas, acentos, y sobre todo la puntuación. Un caso
// REAL de la base: la orden traía «...-DAF-CM-2026.0026» (punto) donde la
// licitación tenía «...-DAF-CM-2026-0026» (guion). Comparando en crudo no
// cruzaban; normalizando, sí. Se conserva solo letras y números.
export function normalizarExpediente(codigo: string | null | undefined): string {
  return (codigo ?? "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // acentos fuera
    .replace(/[^A-Z0-9]/g, "");
}

/**
 * Busca a qué proceso pertenece un código de expediente. Devuelve null si no
 * cruza con ninguno — que es lo normal cuando la licitación se trabajó fuera.
 *
 * Deliberadamente SOLO cruza exacto (ya normalizado). Nada de parecidos: un
 * enlace equivocado entre una orden y una licitación ajena es peor que no
 * tener enlace, porque contamina el historial de adjudicaciones que el F.040
 * declara ante el Estado.
 */
export function buscarProcesoPorExpediente<T extends ProcesoParaEnlace>(
  codigoExpediente: string | null | undefined,
  procesos: T[],
): T | null {
  const buscado = normalizarExpediente(codigoExpediente);
  if (!buscado) return null;
  const coincidencias = procesos.filter(
    (p) => normalizarExpediente(p.codigo) === buscado,
  );
  // Con más de uno no se adivina: dos procesos con el mismo expediente es un
  // problema de datos, y elegir al azar lo escondería.
  return coincidencias.length === 1 ? coincidencias[0] : null;
}

// Los estados en los que una licitación TODAVÍA NO reconoce que se ganó. Si
// llegó la orden de compra estando en cualquiera de estos, el sistema tiene
// una contradicción que enseñar: la orden es la prueba de que se ganó.
const ESTADOS_SIN_RECONOCER_VICTORIA = [
  "captura",
  "calificacion",
  "costeo",
  "armado",
  "listo",
  "sometido",
  "subsanacion",
];

/**
 * ¿Hay que proponer marcar esta licitación como adjudicada? Se propone, no se
 * decide: el cambio de estado lo confirma una persona con un clic.
 *
 * «perdido» y «descartado» también entran: si llegó una orden de compra de un
 * proceso marcado como perdido, algo está mal y hay que verlo.
 */
export function proponerAdjudicar(estadoProceso: string): boolean {
  return (
    ESTADOS_SIN_RECONOCER_VICTORIA.includes(estadoProceso) ||
    estadoProceso === "perdido" ||
    estadoProceso === "descartado"
  );
}
