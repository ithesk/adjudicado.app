// El expediente completo de un proceso: el ZIP del botón «Descargar
// procedimiento» de la vista pública del portal. Sin login trae TODO lo que
// se publicó, incluidas las ofertas de cada oferente:
//
//   1_Publicaciones/   pliego, ficha, solicitud, certificación de fondos…
//   2_Adendas/         enmiendas y circulares
//   3_Ofertas/         Ofertas.pdf (lista de llegada) y una carpeta por
//                      oferente con lo que subió + su «…_Resumen.pdf» (el
//                      cuestionario: precio por artículo y lotes contestados)
//   4_AperturaDeSobres/ acta de apertura, informes periciales
//   5_Analisis/        evaluación (si la publicaron aparte)
//   6_Adjudicacion/    acta de adjudicación (lugares ocupados, motivos)
//   7_Contratos/       órdenes y contratos por adjudicatario
//   8_Mensajes/        mensajes del proceso (aclaraciones, subsanaciones)
//
// Cómo se llega (probado oct-2026): la página pública del proceso trae un
// `mkey`; /DownloadProcess?mkey=… responde un HTML con
// window.location = …/RetrieveFile.aspx?key=…, que sirve el ZIP. El servidor
// NO acepta Range: para leer un archivo hay que recorrer el ZIP desde el
// principio. Por eso se lee en streaming (cabeceras locales, que en estos ZIP
// traen el tamaño: sin «data descriptor») y solo se guarda lo pedido. Un
// proceso chico pesa ~100 MB; uno grande, bastante más.

import { inflateRawSync } from "node:zlib";
import { abrirPortal, textoPortal } from "./portal";

// Los nombres vienen en CP437 (sin el bit UTF-8): «Técnica» llega como 0x82.
const CP437_ALTO =
  "ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ ";

export function decodificarCp437(b: Uint8Array): string {
  let s = "";
  for (const c of b) s += c < 0x80 ? String.fromCharCode(c) : CP437_ALTO[c - 0x80];
  return s;
}

export interface EntradaZip {
  ruta: string;
  bytes: number;
}

export interface RecorridoZip {
  entradas: EntradaZip[];
  archivos: Map<string, Uint8Array>;
  /** false si se cortó antes del final (se encontró lo buscado, tope de tiempo o de bytes). */
  completo: boolean;
  motivoCorte?: string;
}

export interface OpcionesRecorrido {
  /** ¿Guardar el contenido de esta entrada? */
  guardar: (ruta: string, bytes: number) => boolean;
  /** Cortar la descarga apenas se guarde una entrada que cumpla esto. */
  pararTras?: (ruta: string) => boolean;
  maxGuardado?: number;
  /** Momento (Date.now()) en que se deja de leer, para no pasarse del tiempo de la función. */
  limite?: number;
  /**
   * Si está, cada entrada guardada se entrega aquí (p. ej. para subirla a
   * storage) y NO se acumula en memoria: así se recorre un expediente de
   * cientos de MB. Mientras la promesa no se resuelve, no se sigue leyendo.
   */
  alGuardar?: (ruta: string, contenido: Uint8Array) => Promise<void>;
}

// Lector secuencial sobre los trozos que llegan de la red: tomar() copia
// solo lo pedido y saltar() descarta sin acumular.
class Lector {
  private cola: Buffer[] = [];
  private disponibles = 0;
  leidos = 0;
  constructor(private it: AsyncIterator<Buffer>) {}

  private async llenar(n: number) {
    while (this.disponibles < n) {
      const r = await this.it.next();
      if (r.done) return false;
      this.cola.push(r.value);
      this.disponibles += r.value.length;
    }
    return true;
  }

  async tomar(n: number): Promise<Buffer | null> {
    if (!(await this.llenar(n))) return null;
    const out = Buffer.allocUnsafe(n);
    let o = 0;
    while (o < n) {
      const c = this.cola[0];
      const k = Math.min(c.length, n - o);
      c.copy(out, o, 0, k);
      o += k;
      if (k === c.length) this.cola.shift();
      else this.cola[0] = c.subarray(k);
    }
    this.disponibles -= n;
    this.leidos += n;
    return out;
  }

  async saltar(n: number) {
    let falta = n;
    while (falta > 0) {
      if (this.disponibles === 0 && !(await this.llenar(1))) return false;
      const c = this.cola[0];
      const k = Math.min(c.length, falta);
      if (k === c.length) this.cola.shift();
      else this.cola[0] = c.subarray(k);
      this.disponibles -= k;
      this.leidos += k;
      falta -= k;
    }
    return true;
  }
}

const FIRMA_LOCAL = 0x04034b50;

export async function recorrerZip(fuente: AsyncIterable<Buffer>, op: OpcionesRecorrido): Promise<RecorridoZip> {
  const it = fuente[Symbol.asyncIterator]();
  const lector = new Lector(it);
  const entradas: EntradaZip[] = [];
  const archivos = new Map<string, Uint8Array>();
  const maxGuardado = op.maxGuardado ?? 60 * 1024 * 1024;
  let guardado = 0;
  const cortar = async (motivo: string): Promise<RecorridoZip> => {
    await it.return?.();
    return { entradas, archivos, completo: false, motivoCorte: motivo };
  };

  for (;;) {
    if (op.limite && Date.now() > op.limite) return cortar("tiempo");
    const firma = await lector.tomar(4);
    // Fin de las entradas: empieza el directorio central (o se acabó el archivo).
    if (!firma || firma.readUInt32LE(0) !== FIRMA_LOCAL) {
      await it.return?.();
      return { entradas, archivos, completo: true };
    }
    const h = await lector.tomar(26);
    if (!h) throw new Error("El ZIP del expediente llegó cortado.");
    const flags = h.readUInt16LE(2);
    const metodo = h.readUInt16LE(4);
    const comprimido = h.readUInt32LE(14);
    const largoNombre = h.readUInt16LE(22);
    const largoExtra = h.readUInt16LE(24);
    if (flags & 0x08) {
      // Tamaño al final del dato: no se puede saltar sin descomprimir.
      throw new Error("El ZIP del expediente usa un formato que no se puede leer en streaming.");
    }
    const nombre = await lector.tomar(largoNombre);
    if (!nombre || !(await lector.saltar(largoExtra))) throw new Error("El ZIP del expediente llegó cortado.");
    const ruta = flags & 0x800 ? nombre.toString("utf8") : decodificarCp437(nombre);
    const original = h.readUInt32LE(18);

    if (ruta.endsWith("/")) {
      await lector.saltar(comprimido);
      continue;
    }
    entradas.push({ ruta, bytes: original });
    if (op.guardar(ruta, original) && guardado + comprimido <= maxGuardado && (metodo === 0 || metodo === 8)) {
      const dato = await lector.tomar(comprimido);
      if (!dato) throw new Error("El ZIP del expediente llegó cortado.");
      const contenido = new Uint8Array(metodo === 8 ? inflateRawSync(dato) : dato);
      if (op.alGuardar) await op.alGuardar(ruta, contenido);
      else {
        archivos.set(ruta, contenido);
        guardado += comprimido;
      }
      if (op.pararTras?.(ruta)) return cortar("encontrado");
    } else if (!(await lector.saltar(comprimido))) {
      throw new Error("El ZIP del expediente llegó cortado.");
    }
  }
}

/** URL directa del ZIP a partir de la URL pública del proceso (la de la API). */
export async function urlExpediente(urlProceso: string): Promise<string> {
  const pagina = new URL(urlProceso.replace(/(\.gob\.do)\/+/, "$1/"));
  const html = await textoPortal(pagina.toString());
  const mkey = html.match(/DownloadProcess' \+ '\?mkey=([\w-]+)/)?.[1];
  if (!mkey) throw new Error("La página del proceso no ofrece «Descargar procedimiento».");
  // Armar el ZIP de un proceso grande le toma tiempo al portal.
  const r = await textoPortal(`${pagina.origin}/Public/Tendering/OpportunityDetail/DownloadProcess?mkey=${mkey}`, 120_000);
  const destino = r.match(/location\.href\s*=\s*'([^']+)'/)?.[1];
  if (!destino) throw new Error("El portal no devolvió el enlace del expediente.");
  return new URL(destino, pagina.origin).toString();
}

export async function recorrerExpediente(urlProceso: string, op: OpcionesRecorrido) {
  const res = await abrirPortal(await urlExpediente(urlProceso), 120_000);
  return recorrerZip(res as AsyncIterable<Buffer>, op);
}

// ===== Clasificación de las rutas =====

export interface RutaExpediente {
  carpeta: string;
  /** Carpeta del oferente dentro de 3_Ofertas, si aplica. */
  oferente: string | null;
  archivo: string;
}

export function partesRuta(ruta: string): RutaExpediente {
  const p = ruta.split("/");
  const carpeta = p[0] ?? "";
  const oferente = carpeta.startsWith("3_Ofertas") && p.length > 2 ? p[1] : null;
  return { carpeta, oferente, archivo: p[p.length - 1] };
}

/** Lo que dice cómo terminó el proceso: se lee entero en resultado_proceso. */
export function esDocumentoClave(ruta: string): boolean {
  const { carpeta, oferente, archivo } = partesRuta(ruta);
  if (carpeta.startsWith("3_Ofertas")) {
    return oferente === null ? /^ofertas\.pdf$/i.test(archivo) : /_RANL_\d+_Resumen\.pdf$/i.test(archivo);
  }
  return /^(4_|5_|6_|8_)/.test(carpeta) || /^2_Adendas/.test(carpeta);
}
