// Lo que hacen las herramientas del MCP sobre resultados y expedientes
// (resultado_proceso, leer_expediente, guardar_resultado,
// estadisticas_licitaciones), sobre la caché y la cola de expedientes.

import { createHash } from "node:crypto";
import PizZip from "pizzip";
import * as dgcp from "@/lib/dgcp/api";
import { partesRuta, recorrerExpediente } from "@/lib/dgcp/expediente";
import { normalizar } from "@/lib/dgcp/relevancia";
import { extraerTexto, tramo } from "@/lib/dgcp/texto";
import { empresaBasica, procesosPorCodigo, type Ctx } from "@/lib/mcp/datos";
import { bajarBinario, bajarTexto, guardarFila, hayQueRefrescar, leerFila, subirBinario, type FilaExpediente } from "./almacen";
import { encolarExpediente } from "./cola";
import { proveedor } from "./llm";
import { asegurarTexto, MAX_BINARIO, ocrArchivo, prioridad } from "./preparar";
import {
  actualizarLigero,
  analisisVigente,
  analizarNuestra,
  estadisticas,
  mismoOferente,
  type FilaResultado,
  type Nosotros,
} from "./resultados";

const espera = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

async function nosotrosDe(ctx: Ctx): Promise<Nosotros> {
  const e = await empresaBasica(ctx);
  return { rpe: e?.rpe ?? null, razon_social: e?.nombre_legal ?? null };
}

/**
 * Asegura que el expediente esté (o se esté) preparando y, si `hasta`,
 * espera a que llegue a `objetivo` ("descargado" o "listo").
 */
async function asegurarExpediente(
  ctx: Ctx & { baseUrl: string },
  codigo: string,
  estadoDgcp: string | null,
  objetivo: "descargado" | "listo",
  hasta: number | null,
  reintentar = false,
): Promise<FilaExpediente | null> {
  let fila = await leerFila(ctx.supabase, codigo);
  if (reintentar && fila && fila.estado !== "listo") {
    // Pedido explícito: olvidar los fallos (y una reserva colgada) y volver a empezar.
    await guardarFila(ctx.supabase, codigo, { estado: "pendiente", intentos: 0, error: null, trabajando_hasta: null });
    fila = await leerFila(ctx.supabase, codigo);
  }
  const falta = hayQueRefrescar(fila, estadoDgcp) || fila?.estado !== "listo";
  // Alguien lo está procesando (la reserva vence sola si esa función murió).
  const reservado = !!fila?.trabajando_hasta && new Date(fila.trabajando_hasta) > new Date();
  // Tres fallos seguidos: no insistir hasta el día siguiente.
  const agotado =
    fila?.estado === "error" && fila.intentos >= 3 && Date.now() - new Date(fila.updated_at).getTime() < 86_400_000;
  if (falta && !reservado && !agotado) {
    // La ruta reserva antes de responder: al volver, la fila ya dice «procesando».
    await encolarExpediente(codigo, ctx.baseUrl);
    fila = await leerFila(ctx.supabase, codigo);
  }
  const llego = (f: FilaExpediente | null) =>
    !!f && (objetivo === "listo" ? f.estado === "listo" : !!f.descargado_at && !hayQueRefrescar(f, estadoDgcp));
  while (hasta && !llego(fila) && Date.now() < hasta && fila?.estado !== "error") {
    await espera(5_000);
    fila = await leerFila(ctx.supabase, codigo);
  }
  return fila;
}

function porOferente(fila: FilaExpediente, ofertas: dgcp.DgcpOferta[]) {
  const r: Record<string, { ruta: string; kb: number; texto: string }[]> = {};
  const otras: Record<string, number> = {};
  for (const a of fila.archivos) {
    const { carpeta, oferente } = partesRuta(a.ruta);
    if (oferente) (r[oferente] ??= []).push({ ruta: a.ruta, kb: Math.round(a.bytes / 1024), texto: a.texto });
    else otras[carpeta] = (otras[carpeta] ?? 0) + 1;
  }
  // Quien ofertó y no tiene archivos (oferta en papel, sobre vacío) también es un dato.
  for (const o of ofertas) {
    if (!Object.keys(r).some((n) => mismoOferente({ razon_social: n }, o))) r[o.razon_social.trim()] = [];
  }
  return { por_oferente: r, otras_carpetas: otras };
}

const TOPE_TEXTO = 45_000;

/** Texto de los documentos que más pesan, con tope: el análisis ya trae los datos. */
async function documentosClave(ctx: Ctx, fila: FilaExpediente) {
  const clave = fila.archivos
    .filter((a) => /^(4_|5_|6_)/.test(partesRuta(a.ruta).carpeta))
    .sort((a, b) => prioridad(a.ruta) - prioridad(b.ruta));
  const vistos = new Set<string>();
  const salida: { ruta: string; texto?: string; aviso?: string }[] = [];
  let usados = 0;
  for (const a of clave) {
    if (a.sha1 && vistos.has(a.sha1)) continue;
    vistos.add(a.sha1);
    if (a.texto !== "listo") {
      salida.push({ ruta: a.ruta, aviso: a.ocr_fallido ? `Sin texto: ${a.ocr_fallido}` : `Sin texto (${a.texto}).` });
      continue;
    }
    if (usados >= TOPE_TEXTO) {
      salida.push({ ruta: a.ruta, aviso: "No cabe aquí: léelo con leer_expediente." });
      continue;
    }
    const t = (await bajarTexto(ctx.supabase, fila.codigo, a.sha1))
      .join("\n")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\n\s*\n+/g, "\n");
    const corte = t.slice(0, Math.min(10_000, TOPE_TEXTO - usados));
    usados += corte.length;
    salida.push({ ruta: a.ruta, texto: corte.length < t.length ? `${corte}\n[…sigue con leer_expediente]` : corte });
  }
  return salida;
}

export async function resultadoProceso(ctx: Ctx & { baseUrl: string }, codigo: string, esperar: boolean, reintentar = false) {
  const inicio = Date.now();
  const nosotros = await nosotrosDe(ctx);
  const { proceso, ofertas, contratos, ligero } = await actualizarLigero(ctx.supabase, ctx.orgId, codigo, nosotros);
  if (!proceso) throw new Error(`La DGCP no tiene un proceso con código ${codigo}.`);

  const fila = await asegurarExpediente(ctx, codigo, proceso.estado_proceso, "listo", esperar ? inicio + 150_000 : null, reintentar);

  const tabla = [...ofertas]
    .sort((x, y) => (x.valor_oferta ?? Infinity) - (y.valor_oferta ?? Infinity))
    .map((o, i) => {
      const adj = contratos.filter((c) => mismoOferente(c, o));
      return {
        posicion_por_precio: i + 1,
        razon_social: o.razon_social.trim(),
        rpe: o.rpe,
        valor_oferta: o.valor_oferta,
        tipo_oferta: o.tipo_oferta,
        entregada: o.fecha_entrega_oferta,
        es_nuestra: mismoOferente(o, nosotros),
        adjudicado: adj.length > 0,
        valor_adjudicado: adj.length ? adj.reduce((n, c) => n + (c.valor_contratado ?? 0), 0) : null,
      };
    });

  const base = {
    proceso: {
      codigo,
      titulo: proceso.titulo,
      institucion: proceso.unidad_compra,
      modalidad: proceso.modalidad,
      estado: proceso.estado_proceso,
      monto_estimado: proceso.monto_estimado,
      divisa: proceso.divisa,
      url: proceso.url,
    },
    nuestra_empresa: { ...nosotros, participo: tabla.some((o) => o.es_nuestra) },
    resultado_segun_api: ligero.resultado,
    ofertas: tabla,
    adjudicaciones_api: contratos.map((c) => ({
      razon_social: c.razon_social,
      valor_contratado: c.valor_contratado,
      fecha_adjudicacion: c.fecha_adjudicacion,
      contrato: c.codigo_contrato,
    })),
  };

  if (!fila || fila.estado !== "listo") {
    return {
      ...base,
      expediente: {
        estado: fila?.estado ?? "pendiente",
        fase: fila?.fase ?? "descargar",
        error: fila?.error ?? null,
        aviso:
          fila?.estado === "error"
            ? "No se pudo preparar el expediente. Con la API (arriba) ya se puede adelantar; reintenta más tarde."
            : "El expediente se está preparando en segundo plano (descarga, OCR, análisis). Vuelve a llamar a resultado_proceso en 1-2 minutos.",
      },
    };
  }

  // Nuestra comparación (por organización): la guardada si sigue valiendo; si no, se hace ahora.
  let comparacion = null;
  let avisoComparacion: string | null = null;
  if (base.nuestra_empresa.participo) {
    const { data: previo } = await ctx.supabase
      .from("lic_resultado")
      .select("detalle, analizado_at")
      .eq("org_id", ctx.orgId)
      .eq("codigo", codigo)
      .maybeSingle();
    if (previo?.detalle && analisisVigente(previo, fila)) comparacion = previo.detalle;
    else if (Date.now() - inicio < 180_000 && proveedor()) {
      comparacion = await analizarNuestra(ctx.supabase, ctx.orgId, fila, nosotros, ofertas, contratos).catch((e) => {
        avisoComparacion = `No se pudo comparar nuestra oferta: ${e instanceof Error ? e.message : e}`;
        return null;
      });
    } else avisoComparacion = "No dio tiempo de comparar nuestra oferta: vuelve a llamar.";
  }

  const enApp = (await procesosPorCodigo(ctx, [codigo])).get(codigo);
  return {
    ...base,
    analisis_expediente: fila.analisis,
    nuestra_comparacion: comparacion,
    ...(avisoComparacion ? { aviso_comparacion: avisoComparacion } : {}),
    expediente: { estado: "listo", archivos: fila.archivos.length, preparado: fila.listo_at, ...porOferente(fila, ofertas) },
    documentos_clave: await documentosClave(ctx, fila),
    en_adjudicado: enApp ? { estado: enApp.estado, url: `${ctx.baseUrl}/licitaciones/${enApp.id}` } : null,
  };
}

// Fragmento de ruta → ¿coincide? Todas las palabras deben aparecer.
export function coincideRuta(ruta: string, buscado: string) {
  if (ruta === buscado) return true;
  const r = normalizar(ruta);
  return normalizar(buscado)
    .split(/[\s/]+/)
    .filter(Boolean)
    .every((t) => r.includes(t));
}

export async function leerArchivo(
  ctx: Ctx & { baseUrl: string },
  codigo: string,
  archivo: string,
  desdePagina: number,
  maxCaracteres: number,
) {
  const inicio = Date.now();
  const proceso = await dgcp.obtenerProceso(codigo);
  if (!proceso) throw new Error(`La DGCP no tiene un proceso con código ${codigo}.`);
  const fila = await asegurarExpediente(ctx, codigo, proceso.estado_proceso, "descargado", inicio + 150_000);
  if (!fila?.descargado_at) {
    return { aviso: "El expediente aún se está descargando. Vuelve a llamar en 1-2 minutos.", estado: fila?.estado, error: fila?.error };
  }

  const [externo, interno] = archivo.split("::");
  const a =
    fila.archivos.find((x) => x.ruta === externo.trim()) ?? fila.archivos.find((x) => coincideRuta(x.ruta, externo.trim()));
  if (!a) {
    const t = normalizar(externo).split(/[\s/]+/).filter((x) => x.length > 3);
    const parecidos = fila.archivos.filter((x) => t.some((p) => normalizar(x.ruta).includes(p))).map((x) => x.ruta);
    throw new Error(
      `No encontré «${externo}» en el expediente. Rutas ${parecidos.length ? "parecidas" : "disponibles"}: ` +
        (parecidos.length ? parecidos : fila.archivos.map((x) => x.ruta)).slice(0, 80).join(" · "),
    );
  }
  const base = { archivo: a.ruta, kb: Math.round(a.bytes / 1024) };
  if (!a.guardado) {
    if (a.bytes > MAX_BINARIO) {
      return { ...base, aviso: "Pesa más de 45 MB: pide al usuario que lo descargue del portal y lo adjunte." };
    }
    // No se guardó al bajar el expediente: se trae del portal (recorriendo el
    // ZIP hasta él) y queda guardado.
    const r = await recorrerExpediente(proceso.url!, {
      guardar: (ruta) => ruta === a.ruta,
      pararTras: () => true,
      limite: inicio + 200_000,
    });
    const contenido = r.archivos.get(a.ruta);
    if (!contenido) return { ...base, aviso: "No se pudo traer del portal a tiempo; vuelve a intentarlo." };
    a.sha1 = createHash("sha1").update(contenido).digest("hex");
    await subirBinario(ctx.supabase, codigo, a.sha1, contenido);
    a.guardado = true;
    a.texto = "sin_procesar";
  }

  if (a.texto === "sin_procesar") {
    await asegurarTexto(ctx.supabase, codigo, a);
    await guardarFila(ctx.supabase, codigo, { archivos: fila.archivos });
  }
  let paginas: string[];
  let ocr = !!a.ocr;
  if (/\.zip$/i.test(a.ruta)) {
    const zip = new PizZip(await bajarBinario(ctx.supabase, codigo, a.sha1));
    const internos = Object.values(zip.files).filter((f) => !f.dir).map((f) => f.name);
    if (!interno) return { ...base, contenido_zip: internos };
    const elegido = internos.find((n) => coincideRuta(n, interno.trim()));
    if (!elegido) throw new Error(`«${interno}» no está en ${a.ruta}. Contiene: ${internos.join(" · ")}`);
    const t = await extraerTexto(elegido, zip.file(elegido)!.asUint8Array());
    if (t.formato === "otro" || t.escaneado) return { ...base, archivo: `${a.ruta}::${elegido}`, aviso: "Archivo interno sin texto legible." };
    paginas = t.paginas;
  } else if (/\.rar$/i.test(a.ruta)) {
    return { ...base, aviso: "Es un .rar: no se puede leer aquí. Pide al usuario que lo extraiga y adjunte." };
  } else if (a.texto === "ilegible") {
    return { ...base, aviso: "Formato no legible como texto." };
  } else if (a.texto === "escaneado") {
    if (!proveedor()) return { ...base, aviso: "PDF escaneado y el servidor no tiene modelo de IA para transcribirlo." };
    // OCR a pedido (y queda guardado para la próxima).
    const r = await ocrArchivo(ctx.supabase, codigo, a, inicio + 250_000);
    await guardarFila(ctx.supabase, codigo, { archivos: fila.archivos });
    if (!r.paginas.length) return { ...base, aviso: a.ocr_fallido ?? "El OCR no devolvió texto." };
    paginas = r.paginas;
    ocr = true;
  } else {
    paginas = await bajarTexto(ctx.supabase, codigo, a.sha1);
  }

  const t = tramo({ formato: "pdf", paginas, escaneado: false }, desdePagina, maxCaracteres);
  return {
    ...base,
    ocr,
    ...(a.ocr_siguiente ? { aviso: `OCR a medias: transcrito hasta la página ${a.ocr_siguiente - 1}; vuelve a llamar para seguir.` } : {}),
    paginas: `${t.desde}-${t.hasta} de ${t.total}`,
    hay_mas: t.hasta < t.total,
    hasta: t.hasta,
    texto: t.texto,
  };
}

const ESTADO_PROCESO: Record<string, string | null> = {
  ganado: "adjudicado",
  parcial: "adjudicado",
  perdido: "perdido",
  desierto: null,
  cancelado: null,
  pendiente: null,
};

export async function guardarResultado(
  ctx: Ctx & { baseUrl: string },
  a: { codigo: string; resultado: string; causa?: string | null; informe: string; actualizar_proceso: boolean },
) {
  const { error } = await ctx.supabase.from("lic_resultado").upsert(
    {
      org_id: ctx.orgId,
      codigo: a.codigo,
      resultado: a.resultado,
      ...(a.causa !== undefined ? { causa: a.causa } : {}),
      informe: a.informe,
      confirmado_at: new Date().toISOString(),
      visto: true,
    },
    { onConflict: "org_id,codigo" },
  );
  if (error) throw new Error(`No se pudo guardar el resultado: ${error.message}`);

  const enApp = (await procesosPorCodigo(ctx, [a.codigo])).get(a.codigo);
  let proceso: { estado: string; url: string } | null = null;
  if (enApp && a.actualizar_proceso) {
    const { data: p } = await ctx.supabase.from("lic_proceso").select("notas").eq("id", enApp.id).single();
    const estado = ESTADO_PROCESO[a.resultado] ?? enApp.estado;
    const nota = `- ${new Date().toISOString().slice(0, 10)} — Resultado: ${a.resultado}${a.causa ? ` (${a.causa})` : ""}.\n${a.informe
      .split("\n")
      .map((l) => `  ${l}`)
      .join("\n")}`;
    const { error: e2 } = await ctx.supabase
      .from("lic_proceso")
      .update({ estado, notas: p?.notas ? `${p.notas}\n${nota}` : nota })
      .eq("id", enApp.id);
    if (e2) throw new Error(`Se guardó el resultado, pero no se pudo actualizar el proceso: ${e2.message}`);
    proceso = { estado, url: `${ctx.baseUrl}/licitaciones/${enApp.id}` };
  }
  return { guardado: true, proceso, nota: enApp ? null : "El proceso no está en adjudicado.app: el informe quedó en los resultados." };
}

export async function estadisticasOrg(ctx: Ctx, f: { desde?: string; hasta?: string; institucion?: string }) {
  let q = ctx.supabase
    .from("lic_resultado")
    .select(
      "codigo, institucion, objeto, resultado, causa, nuestro_monto, monto_adjudicado, monto_ganador, oferentes, competidores, fecha_oferta, analizado_at, confirmado_at, visto, detalle",
    )
    .eq("org_id", ctx.orgId);
  if (f.desde) q = q.gte("fecha_oferta", f.desde);
  if (f.hasta) q = q.lte("fecha_oferta", f.hasta);
  const { data, error } = await q.order("fecha_oferta", { ascending: false }).limit(2000);
  if (error) throw new Error(`No se pudieron leer los resultados: ${error.message}`);
  let filas = (data ?? []) as (FilaResultado & { detalle: { explicacion?: string } | null })[];
  if (f.institucion) {
    const t = normalizar(f.institucion);
    filas = filas.filter((r) => normalizar(r.institucion ?? "").includes(t) || normalizar(r.codigo).startsWith(t));
  }
  const novedades = filas
    .filter((r) => !r.visto && r.resultado !== "pendiente")
    .map((r) => ({
      codigo: r.codigo,
      institucion: r.institucion,
      objeto: r.objeto,
      resultado: r.resultado,
      causa: r.causa,
      nuestro_monto: r.nuestro_monto,
      monto_ganador: r.monto_ganador,
      explicacion: r.detalle?.explicacion ?? null,
    }));
  if (novedades.length) {
    await ctx.supabase
      .from("lic_resultado")
      .update({ visto: true })
      .eq("org_id", ctx.orgId)
      .in("codigo", novedades.map((n) => n.codigo));
  }
  return {
    filtro: f,
    ...estadisticas(filas),
    analizados_a_fondo: filas.filter((r) => r.analizado_at).length,
    con_informe: filas.filter((r) => r.confirmado_at).length,
    novedades,
    recientes: filas.slice(0, 15).map((r) => ({
      codigo: r.codigo,
      institucion: r.institucion,
      resultado: r.resultado,
      causa: r.causa,
      nuestro_monto: r.nuestro_monto,
      fecha_oferta: r.fecha_oferta,
    })),
  };
}
