// El modelo que lee el expediente: Claude si hay ANTHROPIC_API_KEY (lo
// recomendado: transcribe actas con firmas y sellos sin negarse); si no,
// OpenAI, que es lo que tiene configurado hoy la app para el OCR de órdenes.
//
//   EXPEDIENTE_MODELO         modelo de Claude (por defecto claude-sonnet-4-6)
//   EXPEDIENTE_MODELO_OPENAI  modelo de OpenAI (por defecto gpt-4.1)

import Anthropic from "@anthropic-ai/sdk";

export function proveedor(): "anthropic" | "openai" | null {
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.OPENAI_API_KEY) return "openai";
  return null;
}

const MODELO_CLAUDE = () => process.env.EXPEDIENTE_MODELO || "claude-sonnet-4-6";
const MODELO_OPENAI = () => process.env.EXPEDIENTE_MODELO_OPENAI || "gpt-4.1";

let cliente: Anthropic | null = null;
const claude = () => (cliente ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }));

function sinProveedor(): never {
  throw new Error("Falta ANTHROPIC_API_KEY (o OPENAI_API_KEY): el expediente se lee con un modelo de IA.");
}

async function openai(cuerpo: object): Promise<{ texto: string }> {
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify(cuerpo),
    signal: AbortSignal.timeout(180_000),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  let texto: string = data.output_text ?? "";
  if (!texto && Array.isArray(data.output)) {
    texto = data.output
      .flatMap((o: { content?: { text?: string }[] }) => o.content ?? [])
      .map((c: { text?: string }) => c.text ?? "")
      .join("");
  }
  return { texto };
}

/** Transcribe un PDF (un tramo de páginas) con las instrucciones dadas. */
export async function leerPdf(pdf: Uint8Array, instrucciones: string): Promise<string> {
  const base64 = Buffer.from(pdf).toString("base64");
  const p = proveedor() ?? sinProveedor();
  if (p === "anthropic") {
    const msg = await claude().messages.create({
      model: MODELO_CLAUDE(),
      max_tokens: 16_000,
      messages: [
        {
          role: "user",
          content: [
            { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } },
            { type: "text", text: instrucciones },
          ],
        },
      ],
    });
    return msg.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
  }
  const { texto } = await openai({
    model: MODELO_OPENAI(),
    max_output_tokens: 16_000,
    input: [
      {
        role: "user",
        content: [
          { type: "input_file", filename: "documento.pdf", file_data: `data:application/pdf;base64,${base64}` },
          { type: "input_text", text: instrucciones },
        ],
      },
    ],
  });
  return texto.trim();
}

// El modo estricto de OpenAI pide additionalProperties: false en cada objeto.
function estricto(esquema: unknown): unknown {
  if (Array.isArray(esquema)) return esquema.map(estricto);
  if (!esquema || typeof esquema !== "object") return esquema;
  const o = Object.fromEntries(Object.entries(esquema).map(([k, v]) => [k, estricto(v)]));
  if (o.type === "object") o.additionalProperties = false;
  return o;
}

/** Datos estructurados (JSON con esquema) a partir de texto. */
export async function extraerJson<T>(sistema: string, contenido: string, nombre: string, esquema: object): Promise<T> {
  const p = proveedor() ?? sinProveedor();
  if (p === "anthropic") {
    const msg = await claude().messages.create({
      model: MODELO_CLAUDE(),
      max_tokens: 16_000,
      system: sistema,
      tools: [{ name: nombre, description: "Devuelve el resultado estructurado.", input_schema: esquema as Anthropic.Tool.InputSchema }],
      tool_choice: { type: "tool", name: nombre },
      messages: [{ role: "user", content: contenido }],
    });
    const uso = msg.content.find((b) => b.type === "tool_use");
    if (!uso || uso.type !== "tool_use") throw new Error("El análisis no devolvió datos estructurados.");
    return uso.input as T;
  }
  const { texto } = await openai({
    model: MODELO_OPENAI(),
    max_output_tokens: 16_000,
    instructions: sistema,
    input: contenido,
    text: { format: { type: "json_schema", name: nombre, schema: estricto(esquema), strict: true } },
  });
  return JSON.parse(texto) as T;
}
