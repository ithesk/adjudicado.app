// MCP sobre «Streamable HTTP» en modo SIN ESTADO: cada POST trae un mensaje
// JSON-RPC (o un lote) y se responde con JSON plano, sin sesión ni SSE. Es lo
// que pide un endpoint serverless (Vercel) y claude.ai lo acepta.
//
// Escrito a mano (no el SDK) porque el subconjunto que usamos es pequeño —
// initialize, ping, tools/list, tools/call— y así no depende de versiones de
// zod ni de transportes con estado. Sin red ni base: se prueba en vitest.

import { z } from "zod";
import type { Herramienta } from "./herramientas";

export const VERSIONES = ["2025-06-18", "2025-03-26", "2024-11-05"];

export const INSTRUCCIONES = `adjudicado.app — licitaciones públicas dominicanas (DGCP / ComprasDominicana) de punta a punta.
Flujo recomendado:
1. buscar_oportunidades → presenta la lista priorizada (urgencia, relevancia, valor) y deja que el usuario elija.
2. ver_proceso con el código elegido → datos, artículos, documentos numerados y patrones conocidos de la institución (súbelos al inicio del análisis).
3. leer_documento 'pliego' y 'ficha' (por tramos si hay_mas) → analiza: productos y marca/modelo probable, fechas, condiciones económicas, requisitos (subsanables vs NO subsanables), alertas.
4. perfil_empresa para saber qué documentación ya está vigente y la tasa/margen por defecto.
5. Con el visto bueno del usuario, importar_proceso: queda en la Bid Room de adjudicado.app para costear y armar el paquete. Comparte la URL que devuelve.
   Si el proceso YA existe, no reimportes: ver_bid_room para ver lo que hay y actualizar_items para corregir o agregar líneas.
   Si el pliego pide imágenes de los productos, imagen_producto con una URL directa de la foto del fabricante.
6. Si el usuario cuenta algo RECURRENTE de una institución (cómo paga, qué exige siempre, si subsana o no), guardar_patron.
Nunca inventes datos del pliego: si algo no aparece, es "No especificado". La spec de cada ítem se copia tal cual.`;

type Id = string | number | null;

interface Peticion {
  jsonrpc: "2.0";
  id?: Id;
  method: string;
  params?: Record<string, unknown>;
}

export type Respuesta =
  | { jsonrpc: "2.0"; id: Id; result: unknown }
  | { jsonrpc: "2.0"; id: Id; error: { code: number; message: string; data?: unknown } };

function error(id: Id, code: number, message: string): Respuesta {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

export function listarHerramientas(herramientas: Herramienta[]) {
  return herramientas.map((h) => {
    const schema = z.toJSONSchema(h.entrada, { io: "input" }) as Record<string, unknown>;
    delete schema.$schema;
    return {
      name: h.nombre,
      title: h.titulo,
      description: h.descripcion,
      inputSchema: schema,
      annotations: { title: h.titulo, readOnlyHint: h.soloLectura, destructiveHint: false, openWorldHint: true },
    };
  });
}

// Un mensaje → su respuesta, o null si era una notificación (sin id).
export async function atender<C>(
  msg: unknown,
  herramientas: Herramienta[],
  ctx: () => Promise<C>,
): Promise<Respuesta | null> {
  const m = msg as Peticion;
  if (!m || m.jsonrpc !== "2.0" || typeof m.method !== "string") {
    return error((m as Peticion | null)?.id ?? null, -32600, "Petición JSON-RPC inválida");
  }
  const esNotificacion = m.id === undefined;
  if (esNotificacion) return null;
  const id = m.id ?? null;

  switch (m.method) {
    case "initialize": {
      const pedida = String(m.params?.protocolVersion ?? "");
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: VERSIONES.includes(pedida) ? pedida : VERSIONES[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "adjudicado", title: "adjudicado.app", version: "1.0.0" },
          instructions: INSTRUCCIONES,
        },
      };
    }
    case "ping":
      return { jsonrpc: "2.0", id, result: {} };
    case "tools/list":
      return { jsonrpc: "2.0", id, result: { tools: listarHerramientas(herramientas) } };
    case "tools/call": {
      const nombre = String(m.params?.name ?? "");
      const h = herramientas.find((x) => x.nombre === nombre);
      if (!h) return error(id, -32602, `Herramienta desconocida: ${nombre}`);
      const args = h.entrada.safeParse(m.params?.arguments ?? {});
      // Los errores de la herramienta van DENTRO del resultado (isError):
      // así Claude los lee y puede corregir la llamada.
      if (!args.success) {
        return {
          jsonrpc: "2.0",
          id,
          result: { isError: true, content: [{ type: "text", text: `Argumentos inválidos: ${z.prettifyError(args.error)}` }] },
        };
      }
      try {
        const salida = await h.ejecutar(args.data as never, (await ctx()) as never);
        return {
          jsonrpc: "2.0",
          id,
          result: { content: [{ type: "text", text: JSON.stringify(salida, null, 1) }] },
        };
      } catch (e) {
        return {
          jsonrpc: "2.0",
          id,
          result: { isError: true, content: [{ type: "text", text: e instanceof Error ? e.message : String(e) }] },
        };
      }
    }
    default:
      return error(id, -32601, `Método no soportado: ${m.method}`);
  }
}
