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

type Salida = { resultado: OcrResultado; crudo: unknown };

// Punto de entrada: OpenAI → Gemini → Claude, según la key disponible.
export async function extraerOrdenDeCompra(pdfBase64: string): Promise<Salida> {
  if (env.ocrProvider === "openai") return extraerConOpenAI(pdfBase64);
  if (env.ocrProvider === "gemini") return extraerConGemini(pdfBase64);
  return extraerConClaude(pdfBase64);
}

// ---- OpenAI (gpt-4o-mini): lee el PDF (Responses API) y devuelve JSON. ----
async function extraerConOpenAI(pdfBase64: string): Promise<Salida> {
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.openaiApiKey}`,
    },
    body: JSON.stringify({
      model: env.ocrModel, // gpt-4o-mini
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_file",
              filename: "oc.pdf",
              file_data: `data:application/pdf;base64,${pdfBase64}`,
            },
            { type: "input_text", text: PROMPT },
          ],
        },
      ],
      text: { format: { type: "json_object" } },
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const data = await res.json();
  // output_text (conveniencia) o recorrer output[].content[].text
  let texto: string = data.output_text ?? "";
  if (!texto && Array.isArray(data.output)) {
    texto = data.output
      .flatMap((o: { content?: { text?: string }[] }) => o.content ?? [])
      .map((c: { text?: string }) => c.text ?? "")
      .join("");
  }
  const crudo = parsearJson(texto);
  return { resultado: normalizar(crudo), crudo };
}

// ---- Google Gemini (Flash): lee el PDF y devuelve JSON. Barato. ----
async function extraerConGemini(pdfBase64: string): Promise<Salida> {
  const model = env.ocrModel; // p.ej. gemini-2.0-flash
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.geminiApiKey}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { inline_data: { mime_type: "application/pdf", data: pdfBase64 } },
            { text: PROMPT },
          ],
        },
      ],
      generationConfig: { responseMimeType: "application/json", temperature: 0 },
    }),
  });

  if (!res.ok) {
    throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const data = await res.json();
  const texto: string =
    data?.candidates?.[0]?.content?.parts
      ?.map((p: { text?: string }) => p.text ?? "")
      .join("") ?? "";
  const crudo = parsearJson(texto);
  return { resultado: normalizar(crudo), crudo };
}

// ---- Anthropic Claude: lee el PDF y devuelve JSON. ----
async function extraerConClaude(pdfBase64: string): Promise<Salida> {
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
