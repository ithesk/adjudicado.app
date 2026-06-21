import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/lib/env";
import type { TipoItem } from "@/lib/types";

export interface OcrItem {
  nombre: string;
  tipo: TipoItem;
  cantidad: number;
  monto: number;
}

export interface OcrResultado {
  numero_oc: string | null;
  institucion: string | null;
  codigo_expediente: string | null;
  fecha_oc: string | null;
  moneda: "DOP" | "USD";
  monto_total: number | null;
  plazo_entrega: string | null;
  items: OcrItem[];
}

const PROMPT = `Eres un extractor de datos de órdenes de compra del Estado dominicano (ComprasDominicana). Lee el PDF adjunto y devuelve únicamente un objeto JSON con esta forma exacta:
{
  "numero_oc": "string|null",
  "institucion": "string|null",
  "codigo_expediente": "string|null",
  "fecha_oc": "YYYY-MM-DD|null",
  "moneda": "DOP|USD",
  "monto_total": number|null,
  "plazo_entrega": "YYYY-MM-DD|null",
  "items": [
    { "nombre": "string", "tipo": "licencia|fisico|servicio", "cantidad": number, "monto": number }
  ]
}
No incluyas texto fuera del JSON, ni explicaciones, ni markdown. Si un campo no aparece en el documento, ponlo en null. Para "tipo" de cada ítem, infiere: software/suscripciones/licencias = "licencia"; equipos/hardware = "fisico"; instalación/soporte/capacitación = "servicio".`;

// Extrae el primer objeto JSON encontrado en el texto del modelo.
function parsearJson(texto: string): unknown {
  const limpio = texto.replace(/```json/gi, "").replace(/```/g, "").trim();
  const inicio = limpio.indexOf("{");
  const fin = limpio.lastIndexOf("}");
  if (inicio === -1 || fin === -1) {
    throw new Error("El modelo no devolvió JSON.");
  }
  return JSON.parse(limpio.slice(inicio, fin + 1));
}

function normalizar(raw: unknown): OcrResultado {
  const o = (raw ?? {}) as Record<string, unknown>;
  const tiposValidos: TipoItem[] = ["licencia", "fisico", "servicio"];

  const items = Array.isArray(o.items)
    ? (o.items as Record<string, unknown>[]).map((it) => {
        const tipo = String(it.tipo ?? "licencia") as TipoItem;
        return {
          nombre: String(it.nombre ?? "Ítem sin nombre"),
          tipo: tiposValidos.includes(tipo) ? tipo : "licencia",
          cantidad: Number(it.cantidad ?? 1) || 1,
          monto: Number(it.monto ?? 0) || 0,
        };
      })
    : [];

  const moneda = o.moneda === "USD" ? "USD" : "DOP";

  return {
    numero_oc: o.numero_oc ? String(o.numero_oc) : null,
    institucion: o.institucion ? String(o.institucion) : null,
    codigo_expediente: o.codigo_expediente
      ? String(o.codigo_expediente)
      : null,
    fecha_oc: o.fecha_oc ? String(o.fecha_oc) : null,
    moneda,
    monto_total:
      o.monto_total != null && o.monto_total !== ""
        ? Number(o.monto_total)
        : null,
    plazo_entrega: o.plazo_entrega ? String(o.plazo_entrega) : null,
    items,
  };
}

// Envía el PDF (base64) a Claude y devuelve los datos estructurados + el crudo.
export async function extraerOrdenDeCompra(pdfBase64: string): Promise<{
  resultado: OcrResultado;
  crudo: unknown;
}> {
  const client = new Anthropic({ apiKey: env.anthropicApiKey });

  const msg = await client.messages.create({
    model: env.ocrModel,
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: pdfBase64,
            },
          },
          { type: "text", text: PROMPT },
        ],
      },
    ],
  });

  const texto = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  const crudo = parsearJson(texto);
  return { resultado: normalizar(crudo), crudo };
}
