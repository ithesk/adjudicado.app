import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cifrar, descifrar } from "./cifrado";

describe("cifrado de credenciales (AES-256-GCM)", () => {
  const previo = process.env.CREDENCIALES_SECRET;
  beforeEach(() => {
    process.env.CREDENCIALES_SECRET = "secreto-de-prueba";
  });
  afterEach(() => {
    process.env.CREDENCIALES_SECRET = previo;
  });

  it("cifra y descifra (round-trip), con salida distinta cada vez (IV aleatorio)", () => {
    const apiKey = "una-api-key-de-odoo-123";
    const a = cifrar(apiKey);
    const b = cifrar(apiKey);
    expect(a).not.toBe(b); // mismo texto, paquetes distintos
    expect(a).not.toContain(apiKey);
    expect(descifrar(a)).toBe(apiKey);
    expect(descifrar(b)).toBe(apiKey);
  });

  it("un paquete manipulado NO descifra (GCM autentica)", () => {
    const paquete = cifrar("secreta");
    const roto = Buffer.from(paquete, "base64");
    roto[roto.length - 1] ^= 0xff;
    expect(() => descifrar(roto.toString("base64"))).toThrow();
  });

  it("sin CREDENCIALES_SECRET, lanza con mensaje claro", () => {
    delete process.env.CREDENCIALES_SECRET;
    expect(() => cifrar("x")).toThrow(/CREDENCIALES_SECRET/);
  });
});
