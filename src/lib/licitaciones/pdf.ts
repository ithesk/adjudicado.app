// Conversión Word→PDF vía Gotenberg (LibreOffice headless en el VPS de la
// empresa, ver infra/gotenberg/). SOLO SERVIDOR.
//
// La conversión fiel de un .docx a PDF necesita un motor de render real —
// eso no corre en Vercel serverless, por eso vive como servicio aparte:
// tonto, sin estado, sin acceso a la base; recibe un docx y devuelve un PDF.

const URL_GOTENBERG = process.env.GOTENBERG_URL;
const TOKEN = process.env.GOTENBERG_TOKEN;

export function pdfDisponible(): boolean {
  return Boolean(URL_GOTENBERG && TOKEN);
}

export async function docxAPdf(nombre: string, docx: Buffer): Promise<Buffer> {
  if (!URL_GOTENBERG || !TOKEN) {
    throw new Error("El convertidor PDF no está configurado (GOTENBERG_URL/TOKEN).");
  }
  const form = new FormData();
  form.append(
    "files",
    new Blob([new Uint8Array(docx)], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }),
    nombre.endsWith(".docx") ? nombre : `${nombre}.docx`,
  );

  const res = await fetch(`${URL_GOTENBERG}/forms/libreoffice/convert`, {
    method: "POST",
    headers: { "X-Api-Key": TOKEN },
    body: form,
    signal: AbortSignal.timeout(55_000),
  });
  if (!res.ok) {
    throw new Error(`El convertidor PDF falló (${res.status}): ${await res.text().then((t) => t.slice(0, 200))}`);
  }
  return Buffer.from(await res.arrayBuffer());
}
