// Cifrado en reposo para credenciales de integraciones (API keys de Odoo…).
// AES-256-GCM autenticado; la llave sale de CREDENCIALES_SECRET (env del
// servidor — es la llave de la caja fuerte, no una credencial de empresa).
// SOLO SERVIDOR.

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function llave(): Buffer {
  const secreto = process.env.CREDENCIALES_SECRET;
  if (!secreto) {
    throw new Error("Falta CREDENCIALES_SECRET (la llave de cifrado de credenciales).");
  }
  // Cualquier longitud de secreto → llave de 32 bytes.
  return createHash("sha256").update(secreto).digest();
}

// Formato: base64( iv[12] + authTag[16] + cifrado ).
export function cifrar(texto: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", llave(), iv);
  const cifrado = Buffer.concat([cipher.update(texto, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), cifrado]).toString("base64");
}

export function descifrar(empaquetado: string): string {
  const buf = Buffer.from(empaquetado, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const cifrado = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", llave(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(cifrado), decipher.final()]).toString("utf8");
}
