import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { Herramienta } from "./herramientas";
import { atender } from "./protocolo";

const eco: Herramienta = {
  nombre: "eco",
  titulo: "Eco",
  descripcion: "Devuelve lo que recibe",
  soloLectura: true,
  entrada: z.object({ texto: z.string(), veces: z.number().int().default(1) }),
  ejecutar: (async (a: { texto: string; veces: number }) => {
    if (a.texto === "falla") throw new Error("se rompió");
    return a.texto.repeat(a.veces);
  }) as never,
};
const ctx = async () => ({});

describe("protocolo MCP", () => {
  it("initialize respeta la versión pedida si la soporta", async () => {
    const r = (await atender(
      { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26" } },
      [eco],
      ctx,
    )) as { result: { protocolVersion: string; capabilities: unknown } };
    expect(r.result.protocolVersion).toBe("2025-03-26");
    expect(r.result.capabilities).toEqual({ tools: { listChanged: false } });
  });

  it("las notificaciones no tienen respuesta", async () => {
    expect(await atender({ jsonrpc: "2.0", method: "notifications/initialized" }, [eco], ctx)).toBeNull();
  });

  it("tools/list publica el JSON Schema de entrada", async () => {
    const r = (await atender({ jsonrpc: "2.0", id: 2, method: "tools/list" }, [eco], ctx)) as {
      result: { tools: { name: string; inputSchema: { required: string[]; properties: object } }[] };
    };
    expect(r.result.tools[0].name).toBe("eco");
    // Con default, «veces» no es obligatorio para quien llama.
    expect(r.result.tools[0].inputSchema.required).toEqual(["texto"]);
  });

  it("tools/call aplica defaults y devuelve texto", async () => {
    const r = (await atender(
      { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "eco", arguments: { texto: "ab", veces: 2 } } },
      [eco],
      ctx,
    )) as { result: { content: { text: string }[] } };
    expect(r.result.content[0].text).toBe('"abab"');
  });

  it("los errores de la herramienta vuelven como isError, no como error JSON-RPC", async () => {
    const r = (await atender(
      { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "eco", arguments: { texto: "falla" } } },
      [eco],
      ctx,
    )) as { result: { isError: boolean; content: { text: string }[] } };
    expect(r.result.isError).toBe(true);
    expect(r.result.content[0].text).toBe("se rompió");
  });

  it("argumentos inválidos también vuelven como isError", async () => {
    const r = (await atender(
      { jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "eco", arguments: {} } },
      [eco],
      ctx,
    )) as { result: { isError: boolean } };
    expect(r.result.isError).toBe(true);
  });

  it("método desconocido es -32601", async () => {
    const r = (await atender({ jsonrpc: "2.0", id: 6, method: "resources/list" }, [eco], ctx)) as {
      error: { code: number };
    };
    expect(r.error.code).toBe(-32601);
  });
});
