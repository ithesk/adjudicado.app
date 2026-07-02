import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

// El webhook de correo no corre en el Edge: necesita Buffer y crypto.
export const runtime = "nodejs";

// ── Constantes ────────────────────────────────────────────────────────────────

const MAX_ADJUNTOS = 5;
const MAX_BYTES_ADJUNTO = 10 * 1024 * 1024; // 10 MB
const MAX_TEXTO_CHARS = 4000;

// Patrón del buzón: oc-<8 chars alfanuméricos en minúscula>@<dominio>
const RE_BUZON = /^oc-([a-z0-9]{8})@/i;

// ── Tipos del payload de Resend Inbound (y formato genérico plano) ────────────

interface DireccionEmail {
  email?: string;
  name?: string;
}

interface AdjuntoResend {
  filename?: string;
  /** Contenido en base64. */
  content?: string;
  content_type?: string;
}

// Formato Resend: { data: { to, from, subject, text, html, attachments } }
interface ResendPayload {
  data?: {
    to?: DireccionEmail[] | string[];
    from?: DireccionEmail | string;
    subject?: string;
    text?: string;
    html?: string;
    attachments?: AdjuntoResend[];
  };
}

// Formato genérico plano (fallback)
interface PayloadPlano {
  to?: string | DireccionEmail | DireccionEmail[];
  from?: string | DireccionEmail;
  subject?: string;
  text?: string;
  html?: string;
  attachments?: AdjuntoResend[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Extrae la dirección de correo de un campo que puede ser string u objeto. */
function extraerEmail(campo: unknown): string {
  if (!campo) return "";
  if (typeof campo === "string") return campo;
  if (typeof campo === "object" && campo !== null) {
    const c = campo as DireccionEmail;
    return c.email ?? "";
  }
  return "";
}

/** Extrae el primer email de un campo to que puede ser array o escalar. */
function extraerDestinatario(to: unknown): string {
  if (!to) return "";
  if (Array.isArray(to)) {
    const primero = to[0];
    return extraerEmail(primero);
  }
  return extraerEmail(to);
}

/** Etiqueta legible del remitente: "Nombre <email>" o solo email. */
function etiquetaRemitente(campo: unknown): string {
  if (!campo) return "desconocido";
  if (typeof campo === "string") return campo;
  if (typeof campo === "object" && campo !== null) {
    const c = campo as DireccionEmail;
    if (c.name && c.email) return `${c.name} <${c.email}>`;
    return c.email ?? c.name ?? "desconocido";
  }
  return String(campo);
}

/**
 * Elimina etiquetas HTML de forma básica para extraer texto plano
 * cuando el payload solo trae HTML y no hay campo text.
 */
function stripTags(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Extrae y normaliza la extensión del nombre de archivo. */
function extArchivo(filename: string): string {
  const partes = filename.split(".");
  return partes.length > 1 ? (partes.pop() ?? "bin").toLowerCase() : "bin";
}

// ── Handler principal ─────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  // 1. Verificar que INBOUND_SECRET esté configurado.
  const secretEsperado = process.env.INBOUND_SECRET;
  if (!secretEsperado) {
    console.error("correo-entrante: INBOUND_SECRET no configurado.");
    return NextResponse.json(
      { ok: false, error: "Servicio no disponible." },
      { status: 503 },
    );
  }

  // 2. Validar el secreto (header o query param).
  const secretHeader = req.headers.get("x-inbound-secret") ?? "";
  const secretQuery = req.nextUrl.searchParams.get("secret") ?? "";
  if (secretHeader !== secretEsperado && secretQuery !== secretEsperado) {
    return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 401 });
  }

  // 3. Parsear el cuerpo.
  let body: ResendPayload & PayloadPlano;
  try {
    body = (await req.json()) as ResendPayload & PayloadPlano;
  } catch {
    return NextResponse.json({ ok: false, error: "Payload inválido." }, { status: 400 });
  }

  // 4. Normalizar campos: soporta formato Resend ({ data: {...} }) y plano.
  const datos = body.data ?? body;
  const toRaw = datos.to;
  const fromRaw = datos.from;
  const subject = datos.subject ?? "(sin asunto)";
  const textRaw = datos.text ?? "";
  const htmlRaw = datos.html ?? "";
  const adjuntosRaw: AdjuntoResend[] = Array.isArray(datos.attachments)
    ? datos.attachments
    : [];

  const direccionDestino = extraerDestinatario(toRaw);
  const remitente = etiquetaRemitente(fromRaw);

  // 5. Extraer el código de buzón del destinatario.
  const match = RE_BUZON.exec(direccionDestino);
  if (!match) {
    // Correo a una dirección no reconocida: no es un error, solo ignorar.
    return NextResponse.json({ ok: false, error: "Buzón no reconocido." }, { status: 404 });
  }
  const codigoBuzon = match[1].toLowerCase();

  // 6. Buscar la orden por buzón usando el cliente admin (no hay sesión de usuario).
  const supabase = createAdminClient();

  const { data: orden, error: errOrden } = await supabase
    .from("orden")
    .select("id, numero_oc, org_id")
    .eq("buzon", codigoBuzon)
    .single();

  if (errOrden || !orden) {
    return NextResponse.json(
      { ok: false, error: "Orden no encontrada para ese buzón." },
      { status: 404 },
    );
  }

  const ordenId: string = (orden as { id: string }).id;
  const numeroOc: string = (orden as { numero_oc: string }).numero_oc;
  const orgId: string = (orden as { org_id: string }).org_id;

  // 7. Construir el texto de la entrada de bitácora principal.
  //    Si solo hay HTML, extraemos texto plano básico.
  let cuerpoTexto = textRaw.trim();
  if (!cuerpoTexto && htmlRaw) {
    cuerpoTexto = stripTags(htmlRaw);
  }

  const textoBitacora = [
    `De: ${remitente}`,
    `Asunto: ${subject}`,
    "",
    cuerpoTexto,
  ]
    .join("\n")
    .slice(0, MAX_TEXTO_CHARS);

  // 8. Insertar la entrada principal en la bitácora.
  const { error: errBit } = await supabase.from("bitacora").insert({
    orden_id: ordenId,
    autor_id: null,
    tipo: "correo",
    texto: textoBitacora,
  });

  if (errBit) {
    console.error("correo-entrante: error al insertar bitácora:", errBit.message);
    return NextResponse.json(
      { ok: false, error: "Error al registrar en la bitácora." },
      { status: 500 },
    );
  }

  // 9. Procesar adjuntos (máx MAX_ADJUNTOS, máx MAX_BYTES_ADJUNTO c/u).
  const adjuntosValidos = adjuntosRaw
    .filter((a) => a.content && a.filename)
    .slice(0, MAX_ADJUNTOS);

  for (const adjunto of adjuntosValidos) {
    try {
      const filename = adjunto.filename ?? "adjunto";
      const ext = extArchivo(filename);
      const contenidoBase64 = adjunto.content ?? "";
      const bytes = Buffer.from(contenidoBase64, "base64");

      if (bytes.byteLength > MAX_BYTES_ADJUNTO) {
        console.warn(
          `correo-entrante: adjunto "${filename}" supera el límite (${bytes.byteLength} bytes). Omitido.`,
        );
        continue;
      }

      const storagePath = `${orgId}/${ordenId}/${randomUUID()}.${ext}`;
      const contentType =
        adjunto.content_type ?? "application/octet-stream";

      // Subir al bucket "documentos".
      const { error: errUpload } = await supabase.storage
        .from("documentos")
        .upload(storagePath, bytes, { contentType });

      if (errUpload) {
        console.error(
          `correo-entrante: error al subir "${filename}":`,
          errUpload.message,
        );
        continue;
      }

      // Registrar el documento.
      const { data: doc, error: errDoc } = await supabase
        .from("documento")
        .insert({
          orden_id: ordenId,
          nombre: filename,
          tipo: "adjunto",
          archivo_url: storagePath,
          subido_por: null,
        })
        .select("id")
        .single();

      if (errDoc || !doc) {
        console.error(
          `correo-entrante: error al registrar documento "${filename}":`,
          errDoc?.message,
        );
        continue;
      }

      // Entrada adicional en bitácora que referencia el documento.
      await supabase.from("bitacora").insert({
        orden_id: ordenId,
        autor_id: null,
        tipo: "correo",
        texto: filename,
        documento_id: (doc as { id: string }).id,
      });
    } catch (err) {
      console.error(
        `correo-entrante: excepción procesando adjunto "${adjunto.filename}":`,
        err,
      );
    }
  }

  return NextResponse.json({ ok: true, orden: numeroOc });
}
