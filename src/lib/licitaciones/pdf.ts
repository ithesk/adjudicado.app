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

// Une varios PDF en UNO, en el orden recibido (Gotenberg une alfabéticamente
// por nombre de archivo — por eso el índice numérico con relleno).
export async function unirPdfs(pdfs: Buffer[]): Promise<Buffer> {
  if (!URL_GOTENBERG || !TOKEN) {
    throw new Error("El convertidor PDF no está configurado (GOTENBERG_URL/TOKEN).");
  }
  if (pdfs.length === 1) return pdfs[0];
  const form = new FormData();
  pdfs.forEach((b, i) => {
    form.append(
      "files",
      new Blob([new Uint8Array(b)], { type: "application/pdf" }),
      `${String(i + 1).padStart(3, "0")}.pdf`,
    );
  });
  const res = await fetch(`${URL_GOTENBERG}/forms/pdfengines/merge`, {
    method: "POST",
    headers: { "X-Api-Key": TOKEN },
    body: form,
    signal: AbortSignal.timeout(55_000),
  });
  if (!res.ok) {
    throw new Error(`No se pudieron unir los PDF (${res.status}): ${await res.text().then((t) => t.slice(0, 200))}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

// HTML→PDF con el Chromium de Gotenberg (la oferta técnica). Ese Chromium
// corre SIN red: el HTML debe traer fuentes e imágenes en base64. El pie
// (footer.html) lo repite Chromium en cada página con los números.
export async function htmlAPdf(html: string, pie?: string): Promise<Buffer> {
  if (!URL_GOTENBERG || !TOKEN) {
    throw new Error("El convertidor PDF no está configurado (GOTENBERG_URL/TOKEN).");
  }
  const form = new FormData();
  form.append("files", new Blob([html], { type: "text/html" }), "index.html");
  if (pie) form.append("files", new Blob([pie], { type: "text/html" }), "footer.html");
  // A4 en pulgadas; márgenes ~13 mm, y abajo espacio para el pie.
  const campos: Record<string, string> = {
    paperWidth: "8.27",
    paperHeight: "11.69",
    marginTop: "0.5",
    marginBottom: "0.6",
    marginLeft: "0.5",
    marginRight: "0.5",
    printBackground: "true",
  };
  for (const [k, v] of Object.entries(campos)) form.append(k, v);

  const res = await fetch(`${URL_GOTENBERG}/forms/chromium/convert/html`, {
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
