// Consulta al padrón de contribuyentes de la DGII vía rnc.megaplus.com.do
// (API pública, sin llave). Se usa al crear/completar entidades: el usuario
// escribe el nombre o el RNC y el sistema trae los datos oficiales.
//
// Solo servidor (se llama desde server actions). Toda consulta es best-effort:
// si el servicio no responde, devolvemos null/[] y la app sigue funcionando.

import { normalizarEntidad } from "@/lib/types";

export type DatosRnc = {
  rnc: string; // formateado como lo publica la DGII: "401-00755-1"
  nombre: string; // razón social oficial (llega en MAYÚSCULAS)
  nombreComercial: string;
  estado: string; // ACTIVO, SUSPENDIDO, DADO DE BAJA…
};

const BASE = "https://rnc.megaplus.com.do/api";
const TIMEOUT_MS = 6000;

// ¿El texto es un RNC (9 dígitos) o una cédula (11)? Acepta guiones, puntos y
// espacios ("401-00755-1"); devuelve solo los dígitos, o null si es un nombre.
export function extraerRnc(texto: string): string | null {
  const limpio = texto.trim();
  if (!limpio || !/^[\d\s.-]+$/.test(limpio)) return null;
  const digitos = limpio.replace(/\D/g, "");
  return digitos.length === 9 || digitos.length === 11 ? digitos : null;
}

// Entre los resultados de una búsqueda por nombre, ¿cuál es LA entidad que el
// usuario escribió? Coincidencia exacta normalizada (razón social o nombre
// comercial); si no, un único resultado para la frase completa también es
// señal suficiente. Con varios candidatos ambiguos no se elige ninguno.
export function elegirCoincidencia(nombre: string, candidatos: DatosRnc[]): DatosRnc | null {
  const buscado = normalizarEntidad(nombre);
  const exacta = candidatos.find(
    (c) => normalizarEntidad(c.nombre) === buscado || normalizarEntidad(c.nombreComercial) === buscado,
  );
  if (exacta) return exacta;
  return candidatos.length === 1 ? candidatos[0] : null;
}

type RespuestaConsulta = {
  error?: boolean;
  cedula_rnc?: string;
  nombre_razon_social?: string;
  nombre_comercial?: string;
  estado?: string;
  resultados?: RespuestaConsulta[];
};

function aDatos(r: RespuestaConsulta): DatosRnc | null {
  if (!r.cedula_rnc || !r.nombre_razon_social) return null;
  return {
    rnc: r.cedula_rnc,
    nombre: r.nombre_razon_social,
    nombreComercial: r.nombre_comercial ?? "",
    estado: r.estado ?? "",
  };
}

async function pedir(ruta: string): Promise<RespuestaConsulta | null> {
  try {
    const res = await fetch(`${BASE}${ruta}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as RespuestaConsulta;
    return json.error ? null : json;
  } catch {
    return null; // caído, lento o sin red: la consulta es opcional
  }
}

export async function consultarPorRnc(rnc: string): Promise<DatosRnc | null> {
  const json = await pedir(`/consulta?rnc=${encodeURIComponent(rnc)}`);
  return json ? aDatos(json) : null;
}

export async function buscarPorNombre(nombre: string): Promise<DatosRnc[]> {
  const json = await pedir(`/consulta/nombres?buscar=${encodeURIComponent(nombre)}`);
  if (!json?.resultados) return [];
  return json.resultados.map(aDatos).filter((d): d is DatosRnc => d !== null);
}
