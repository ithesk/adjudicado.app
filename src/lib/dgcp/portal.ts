// Descargas del portal de ComprasDominicana (comunidad.comprasdominicana.gob.do).
//
// Por qué no basta con fetch: el portal sirve su certificado SIN la cadena
// intermedia (oct-2026: solo la hoja, emitida por Let's Encrypt YR2). curl y
// los navegadores la completan solos; Node no, y fetch falla con
// UNABLE_TO_VERIFY_LEAF_SIGNATURE (de ahí los «fetch failed» de leer_documento).
// Arreglo sin apagar la verificación: se siguen las URL «CA Issuers» (AIA) del
// propio certificado hasta que la cadena cierra contra las raíces de Node, y se
// reintenta con esos intermedios. Se hace una vez por instancia.
//
// Devuelve el cuerpo como stream: el expediente completo de un proceso pesa
// 100 MB o más y se recorre sin guardarlo entero (ver expediente.ts).

import http from "node:http";
import https from "node:https";
import tls from "node:tls";
import { X509Certificate } from "node:crypto";
import type { IncomingMessage } from "node:http";

const ERRORES_CADENA = new Set([
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "UNABLE_TO_GET_ISSUER_CERT",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
]);

let agenteConIntermedios: Promise<https.Agent> | null = null;

function bajarHttp(url: string): Promise<Buffer> {
  return new Promise((ok, ko) => {
    const cliente = url.startsWith("https:") ? https : http;
    cliente
      .get(url, { timeout: 15_000 }, (r) => {
        const partes: Buffer[] = [];
        r.on("data", (d: Buffer) => partes.push(d));
        r.on("end", () => ok(Buffer.concat(partes)));
        r.on("error", ko);
      })
      .on("timeout", function (this: http.ClientRequest) {
        this.destroy(new Error("Tiempo agotado bajando un certificado intermedio"));
      })
      .on("error", ko);
  });
}

function urlEmisor(cert: X509Certificate): string | null {
  return cert.infoAccess?.match(/CA Issuers - URI:(\S+)/)?.[1] ?? null;
}

function hojaDe(host: string): Promise<X509Certificate> {
  return new Promise((ok, ko) => {
    // Solo para LEER el certificado de la hoja; la descarga real verifica.
    const s = tls.connect({ host, port: 443, servername: host, rejectUnauthorized: false }, () => {
      const raw = s.getPeerCertificate().raw;
      s.end();
      ok(new X509Certificate(raw));
    });
    s.setTimeout(15_000, () => s.destroy(new Error(`Sin respuesta TLS de ${host}`)));
    s.on("error", ko);
  });
}

async function construirAgente(host: string): Promise<https.Agent> {
  let cert = await hojaDe(host);
  const intermedios: string[] = [];
  for (let i = 0; i < 4; i++) {
    const url = urlEmisor(cert);
    if (!url) break;
    cert = new X509Certificate(await bajarHttp(url));
    intermedios.push(cert.toString());
    // Al llegar a un certificado firmado por una raíz de Node, la cadena cierra.
    const raiz = tls.rootCertificates.some((pem) => {
      try {
        return cert.checkIssued(new X509Certificate(pem));
      } catch {
        return false;
      }
    });
    if (raiz) break;
  }
  return new https.Agent({ ca: [...tls.rootCertificates, ...intermedios], keepAlive: false });
}

export interface OpcionesPortal {
  /** Cabeceras extra: la cookie de sesión del buscador, X-Requested-With… */
  headers?: Record<string, string>;
  /** Si se da, la petición es POST con este cuerpo (x-www-form-urlencoded). */
  cuerpo?: string;
}

function pedir(
  url: string,
  agente: https.Agent | undefined,
  timeoutMs: number,
  op: OpcionesPortal,
): Promise<IncomingMessage> {
  return new Promise((ok, ko) => {
    const post = op.cuerpo !== undefined;
    const req = https.request(
      url,
      {
        method: post ? "POST" : "GET",
        agent: agente,
        timeout: timeoutMs,
        headers: {
          ...(op.headers ?? {}),
          ...(post
            ? { "content-type": "application/x-www-form-urlencoded", "content-length": String(Buffer.byteLength(op.cuerpo!)) }
            : {}),
        },
      },
      ok,
    );
    req.on("timeout", () => req.destroy(new Error(`El portal no respondió en ${timeoutMs / 1000} s`)));
    req.on("error", ko);
    req.end(post ? op.cuerpo : undefined);
  });
}

function hostPermitido(url: string) {
  const host = new URL(url).hostname;
  if (!host.endsWith("comprasdominicana.gob.do") && !host.endsWith("dgcp.gob.do")) {
    throw new Error(`Solo se descarga del portal de la DGCP (no de ${host}).`);
  }
  return host;
}

/** GET (o POST, con `cuerpo`) al portal siguiendo redirecciones HTTP; el cuerpo queda como stream. */
export async function abrirPortal(url: string, timeoutMs = 45_000, op: OpcionesPortal = {}): Promise<IncomingMessage> {
  let actual = url;
  let actualOp = op;
  for (let saltos = 0; saltos < 5; saltos++) {
    const host = hostPermitido(actual);
    let res: IncomingMessage;
    try {
      res = await pedir(actual, agenteConIntermedios ? await agenteConIntermedios : undefined, timeoutMs, actualOp);
    } catch (e) {
      const codigo = (e as NodeJS.ErrnoException).code ?? "";
      if (!ERRORES_CADENA.has(codigo) || agenteConIntermedios) throw e;
      agenteConIntermedios = construirAgente(host);
      agenteConIntermedios.catch(() => (agenteConIntermedios = null));
      res = await pedir(actual, await agenteConIntermedios, timeoutMs, actualOp);
    }
    const destino = res.headers.location;
    if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && destino) {
      res.resume();
      actual = new URL(destino, actual).toString();
      // Tras una redirección se sigue con GET (las cookies se mantienen).
      actualOp = { headers: actualOp.headers };
      continue;
    }
    if (!res.statusCode || res.statusCode >= 400) {
      res.resume();
      throw new Error(`El portal respondió ${res.statusCode} en ${new URL(actual).pathname}`);
    }
    return res;
  }
  throw new Error("Demasiadas redirecciones en el portal");
}

/** Cuerpo completo, con tope de tamaño. */
export async function bytesPortal(url: string, maxBytes: number, timeoutMs?: number, op?: OpcionesPortal) {
  const res = await abrirPortal(url, timeoutMs, op);
  const largo = Number(res.headers["content-length"] ?? 0);
  if (largo > maxBytes) {
    res.destroy();
    throw new Error(`El archivo pesa ${(largo / 1048576).toFixed(0)} MB; el tope es ${(maxBytes / 1048576).toFixed(0)} MB.`);
  }
  const partes: Buffer[] = [];
  let total = 0;
  for await (const d of res as AsyncIterable<Buffer>) {
    total += d.length;
    if (total > maxBytes) {
      res.destroy();
      throw new Error(`El archivo supera el tope de ${(maxBytes / 1048576).toFixed(0)} MB.`);
    }
    partes.push(d);
  }
  const setCookie = res.headers["set-cookie"] ?? [];
  return {
    bytes: new Uint8Array(Buffer.concat(partes)),
    tipo: String(res.headers["content-type"] ?? ""),
    // Las cookies que el portal quiere dejar (la sesión anónima del buscador).
    cookies: setCookie.map((c) => c.split(";")[0]),
  };
}

export async function textoPortal(url: string, timeoutMs?: number, op?: OpcionesPortal) {
  const { bytes } = await bytesPortal(url, 5 * 1024 * 1024, timeoutMs, op);
  return Buffer.from(bytes).toString("utf8");
}

/** Una página HTML del portal y las cookies que manda con ella. */
export async function paginaPortal(url: string, op?: OpcionesPortal, timeoutMs?: number) {
  const { bytes, cookies } = await bytesPortal(url, 5 * 1024 * 1024, timeoutMs, op);
  return { texto: Buffer.from(bytes).toString("utf8"), cookies };
}
