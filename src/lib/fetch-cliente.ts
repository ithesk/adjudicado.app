"use client";

// fetch del cliente para operaciones LARGAS (generar documentos, PDF, OCR,
// importar). Siempre con tope de tiempo: un spinner no puede girar para
// siempre. Si la red se cae o el servidor cuelga, esto LANZA con un mensaje
// legible — quien llama lo muestra (useAccion ya lo traduce a aviso).

export async function fetchLargo(url: string, ms = 90_000): Promise<Response> {
  try {
    return await fetch(url, { signal: AbortSignal.timeout(ms) });
  } catch (e) {
    throw new Error(
      e instanceof DOMException && e.name === "TimeoutError"
        ? "El servidor tardó demasiado — inténtalo de nuevo en un momento."
        : "Sin conexión con el servidor — revisa tu red e inténtalo de nuevo.",
    );
  }
}
