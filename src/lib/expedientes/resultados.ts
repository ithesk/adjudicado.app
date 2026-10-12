// El resultado de cada proceso en que participó la organización
// (lic_resultado): primero el «ligero», solo con la API de la DGCP (quién
// ofertó, a quién se adjudicó), que el cron calcula para TODAS nuestras
// ofertas; después el «profundo», desde el expediente (por qué, frente al
// pliego y al ganador), que se hace a pedido o para lo reciente. Con eso,
// las estadísticas.

import type { SupabaseClient } from "@supabase/supabase-js";
import * as dgcp from "@/lib/dgcp/api";
import { partesRuta } from "@/lib/dgcp/expediente";
import { normalizar } from "@/lib/dgcp/relevancia";
import { compararNuestra, type ComparacionNuestra } from "./analisis";
import { bajarTexto, esFinal, guardarFila, type FilaExpediente } from "./almacen";
import { asegurarTexto } from "./preparar";

export type Resultado = "ganado" | "parcial" | "perdido" | "desierto" | "cancelado" | "pendiente";

// Razón social comparable: sin tildes, forma societaria ni signos
// («Innovacion Tecnologica Sk,SRL» = «Innovación Tecnológica SK, S.R.L.»).
export function claveEmpresa(s: string) {
  return normalizar(s)
    .replace(/\b(s\.?\s?r\.?\s?l|s\.?\s?a\.?\s?s|s\.?\s?a|e\.?\s?i\.?\s?r\.?\s?l)\.?\s*$/, "")
    .replace(/[^a-z0-9]/g, "");
}

export function mismoOferente(
  a: { rpe?: string | null; razon_social?: string | null },
  b: { rpe?: string | null; razon_social?: string | null },
) {
  if (a.rpe && b.rpe) return String(a.rpe).trim() === String(b.rpe).trim();
  return !!a.razon_social && !!b.razon_social && claveEmpresa(a.razon_social) === claveEmpresa(b.razon_social);
}

export interface Nosotros {
  rpe: string | null;
  razon_social: string | null;
}

export interface Ligero {
  resultado: Resultado;
  nuestro_monto: number | null;
  monto_adjudicado: number | null;
  monto_ganador: number | null;
  oferentes: number;
  fecha_oferta: string | null;
  fecha_adjudicacion: string | null;
  competidores: {
    razon_social: string;
    rpe: string | null;
    valor_oferta: number | null;
    adjudicado: boolean;
    valor_adjudicado: number | null;
  }[];
}

/** Resultado solo con la API: quién ofertó y a quién se le adjudicó. */
export function resultadoLigero(
  estadoDgcp: string | null,
  ofertas: dgcp.DgcpOferta[],
  contratos: dgcp.DgcpContrato[],
  nosotros: Nosotros,
): Ligero {
  const nuestra = ofertas.find((o) => mismoOferente(o, nosotros));
  const nuestrosContratos = contratos.filter((c) => mismoOferente(c, nosotros));
  const otros = contratos.filter((c) => !mismoOferente(c, nosotros));
  const suma = (cs: dgcp.DgcpContrato[]) => (cs.length ? cs.reduce((n, c) => n + (c.valor_contratado ?? 0), 0) : null);

  let resultado: Resultado = "pendiente";
  if (nuestrosContratos.length && otros.length) resultado = "parcial";
  else if (nuestrosContratos.length) resultado = "ganado";
  else if (otros.length) resultado = "perdido";
  else if (/cancelad/i.test(estadoDgcp ?? "")) resultado = "cancelado";
  else if (/desiert/i.test(estadoDgcp ?? "")) resultado = "desierto";
  // «Adjudicado» sin contratos en la API: la API va atrasada; lo dirá el acta.

  const fechas = contratos.map((c) => c.fecha_adjudicacion).filter(Boolean) as string[];
  return {
    resultado,
    nuestro_monto: nuestra?.valor_oferta ?? null,
    monto_adjudicado: suma(nuestrosContratos),
    monto_ganador: suma(otros),
    oferentes: ofertas.length,
    fecha_oferta: nuestra?.fecha_entrega_oferta ?? null,
    fecha_adjudicacion: fechas.sort()[0] ?? null,
    competidores: ofertas
      .filter((o) => !mismoOferente(o, nosotros))
      .map((o) => {
        const cs = contratos.filter((c) => mismoOferente(c, o));
        return {
          razon_social: o.razon_social.trim(),
          rpe: o.rpe,
          valor_oferta: o.valor_oferta,
          adjudicado: cs.length > 0,
          valor_adjudicado: suma(cs),
        };
      }),
  };
}

export interface FilaResultado extends Ligero {
  codigo: string;
  institucion: string | null;
  objeto: string | null;
  modalidad: string | null;
  estado_dgcp: string | null;
  causa: ComparacionNuestra["causa"];
  detalle: ComparacionNuestra | null;
  analizado_at: string | null;
  informe: string | null;
  confirmado_at: string | null;
  visto: boolean;
}

/** Calcula y guarda el resultado ligero; `cambio` si pasó de pendiente a un resultado. */
export async function actualizarLigero(sb: SupabaseClient, orgId: string, codigo: string, nosotros: Nosotros) {
  const [proceso, ofertas, contratos] = await Promise.all([
    dgcp.obtenerProceso(codigo),
    dgcp.listarOfertas(codigo),
    dgcp.listarContratos(codigo),
  ]);
  const l = resultadoLigero(proceso?.estado_proceso ?? null, ofertas, contratos, nosotros);
  const { data: previo } = await sb
    .from("lic_resultado")
    .select("resultado, detalle, causa")
    .eq("org_id", orgId)
    .eq("codigo", codigo)
    .maybeSingle();
  // Si el análisis profundo ya sabe más (la API sin contratos), manda el análisis.
  const resultado = l.resultado === "pendiente" && previo?.detalle ? (previo.resultado as Resultado) : l.resultado;
  const cambio = (previo?.resultado ?? "pendiente") === "pendiente" && resultado !== "pendiente";
  const { error } = await sb.from("lic_resultado").upsert(
    {
      org_id: orgId,
      codigo,
      institucion: proceso?.unidad_compra ?? null,
      objeto: proceso?.titulo ?? null,
      modalidad: proceso?.modalidad ?? null,
      estado_dgcp: proceso?.estado_proceso ?? null,
      ...l,
      resultado,
      ...(cambio ? { visto: false } : {}),
    },
    { onConflict: "org_id,codigo" },
  );
  if (error) throw new Error(`No se pudo guardar el resultado de ${codigo}: ${error.message}`);
  return { proceso, ofertas, contratos, ligero: { ...l, resultado }, cambio };
}

/**
 * Análisis profundo de NUESTRA oferta desde el expediente ya preparado:
 * pliego frente a lo que subimos, ítem por ítem frente al ganador, causa.
 */
export async function analizarNuestra(
  sb: SupabaseClient,
  orgId: string,
  fila: FilaExpediente,
  nosotros: Nosotros,
  ofertas: dgcp.DgcpOferta[],
  contratos: dgcp.DgcpContrato[],
): Promise<ComparacionNuestra | null> {
  const carpeta = fila.archivos
    .map((a) => partesRuta(a.ruta).oferente)
    .find((o) => o && mismoOferente({ razon_social: o }, nosotros));
  if (!carpeta) return null;
  const nuestros = fila.archivos.filter((a) => partesRuta(a.ruta).oferente === carpeta);
  // Nuestros archivos se leen todos (son pocos); quedan extraídos para la próxima.
  if (nuestros.some((a) => a.texto === "sin_procesar")) {
    for (const a of nuestros) await asegurarTexto(sb, fila.codigo, a).catch(() => undefined);
    await guardarFila(sb, fila.codigo, { archivos: fila.archivos });
  }
  const inicio = async (sha1: string) =>
    (await bajarTexto(sb, fila.codigo, sha1).catch(() => [] as string[])).join(" ").replace(/\s+/g, " ").slice(0, 300) || null;
  const nuestrosArchivos = await Promise.all(
    nuestros.map(async (a) => ({ ruta: a.ruta, inicio: a.texto === "listo" ? await inicio(a.sha1) : null })),
  );
  // El resumen del portal trae el precio por ítem; si no hay, la oferta técnica.
  const principal =
    nuestros.find((a) => /_Resumen\.pdf$/i.test(a.ruta) && a.texto === "listo") ??
    nuestros.find((a) => /t[eé]cnica|econ[oó]mica|F_?033/i.test(a.ruta) && a.texto === "listo");
  const textoNuestraOferta = principal
    ? (await bajarTexto(sb, fila.codigo, principal.sha1)).join("\n").replace(/[ \t]{2,}/g, " ").slice(0, 15_000)
    : null;

  const comparacion = await compararNuestra({
    codigo: fila.codigo,
    nosotros: carpeta,
    analisis: fila.analisis,
    ofertas: ofertas.map((o) => ({ razon_social: o.razon_social, rpe: o.rpe, valor: o.valor_oferta, tipo: o.tipo_oferta })),
    adjudicaciones: contratos.map((c) => ({ razon_social: c.razon_social, valor: c.valor_contratado })),
    nuestrosArchivos,
    textoNuestraOferta,
  });
  const { error } = await sb.from("lic_resultado").upsert(
    {
      org_id: orgId,
      codigo: fila.codigo,
      detalle: comparacion,
      causa: comparacion.causa,
      resultado: comparacion.resultado,
      analizado_at: new Date().toISOString(),
    },
    { onConflict: "org_id,codigo" },
  );
  if (error) throw new Error(`No se pudo guardar el análisis de ${fila.codigo}: ${error.message}`);
  return comparacion;
}

/** ¿El análisis guardado sigue valiendo para este expediente? */
export function analisisVigente(r: { analizado_at: string | null } | null, fila: FilaExpediente) {
  return !!r?.analizado_at && !!fila.listo_at && r.analizado_at >= fila.listo_at && esFinal(fila.estado_dgcp);
}

// ===== Estadísticas =====

export interface Estadisticas {
  procesos: number;
  decididos: number;
  pendientes: number;
  por_resultado: Record<Resultado, number>;
  tasa_exito_pct: number | null;
  monto_ofertado: number;
  monto_ganado: number;
  causas_de_perdida: Record<string, number>;
  sin_causa_conocida: number;
  por_institucion: { institucion: string; procesos: number; ganados: number; perdidos: number }[];
  competidores: {
    razon_social: string;
    coincidencias: number;
    nos_gano: number;
    // En los que nos ganó: cuánto más barato fue, en % de nuestra oferta (mediana).
    diferencia_mediana_pct: number | null;
  }[];
}

const mediana = (xs: number[]) => {
  if (!xs.length) return null;
  const o = [...xs].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
};

export function estadisticas(filas: Pick<FilaResultado, "resultado" | "causa" | "institucion" | "nuestro_monto" | "monto_adjudicado" | "competidores">[]): Estadisticas {
  const por_resultado = { ganado: 0, parcial: 0, perdido: 0, desierto: 0, cancelado: 0, pendiente: 0 } as Record<Resultado, number>;
  const causas: Record<string, number> = {};
  let sinCausa = 0;
  const inst = new Map<string, { procesos: number; ganados: number; perdidos: number }>();
  const comp = new Map<string, { razon_social: string; coincidencias: number; nos_gano: number; dif: number[] }>();
  let ofertado = 0;
  let ganado = 0;

  for (const f of filas) {
    por_resultado[f.resultado]++;
    ofertado += f.nuestro_monto ?? 0;
    ganado += f.monto_adjudicado ?? 0;
    if (f.resultado === "perdido") {
      if (f.causa) causas[f.causa] = (causas[f.causa] ?? 0) + 1;
      else sinCausa++;
    }
    const i = inst.get(f.institucion ?? "—") ?? { procesos: 0, ganados: 0, perdidos: 0 };
    i.procesos++;
    if (f.resultado === "ganado" || f.resultado === "parcial") i.ganados++;
    if (f.resultado === "perdido") i.perdidos++;
    inst.set(f.institucion ?? "—", i);

    const ganadores = f.competidores.filter((c) => c.adjudicado);
    for (const c of f.competidores) {
      const k = claveEmpresa(c.razon_social);
      const e = comp.get(k) ?? { razon_social: c.razon_social, coincidencias: 0, nos_gano: 0, dif: [] };
      e.coincidencias++;
      if (c.adjudicado && f.resultado === "perdido") {
        e.nos_gano++;
        // Solo comparable si hubo un único ganador (sin lotes repartidos).
        if (ganadores.length === 1 && f.nuestro_monto && c.valor_adjudicado) {
          e.dif.push(((f.nuestro_monto - c.valor_adjudicado) / f.nuestro_monto) * 100);
        }
      }
      comp.set(k, e);
    }
  }

  const decididos = por_resultado.ganado + por_resultado.parcial + por_resultado.perdido;
  return {
    procesos: filas.length,
    decididos,
    pendientes: por_resultado.pendiente,
    por_resultado,
    tasa_exito_pct: decididos ? Math.round(((por_resultado.ganado + por_resultado.parcial) / decididos) * 1000) / 10 : null,
    monto_ofertado: Math.round(ofertado),
    monto_ganado: Math.round(ganado),
    causas_de_perdida: causas,
    sin_causa_conocida: sinCausa,
    por_institucion: [...inst]
      .map(([institucion, v]) => ({ institucion, ...v }))
      .sort((a, b) => b.procesos - a.procesos)
      .slice(0, 15),
    competidores: [...comp.values()]
      .map((c) => ({
        razon_social: c.razon_social,
        coincidencias: c.coincidencias,
        nos_gano: c.nos_gano,
        diferencia_mediana_pct: c.dif.length ? Math.round(mediana(c.dif)! * 10) / 10 : null,
      }))
      .sort((a, b) => b.nos_gano - a.nos_gano || b.coincidencias - a.coincidencias)
      .slice(0, 15),
  };
}
