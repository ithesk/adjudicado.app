"use client";

// La última red de seguridad: solo entra cuando revienta el layout RAÍZ, y
// entonces sustituye al documento entero — por eso trae su propio <html> y
// <body>, y no puede usar el sistema de diseño (no hay layout que cargue el
// CSS con los tokens). Todo va en estilos en línea a propósito.
//
// Si esto se ve, la app no arrancó. El único objetivo es no dejar una
// pantalla en blanco en inglés y dar una salida.

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
          background: "#f7f8f9",
          color: "#1c1d22",
          padding: "1.5rem",
        }}
      >
        <div style={{ maxWidth: "26rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.125rem", fontWeight: 600, margin: "0 0 0.5rem" }}>
            La aplicación no pudo cargar
          </h1>
          <p style={{ fontSize: "0.875rem", lineHeight: 1.6, color: "#6a6e78", margin: "0 0 1.25rem" }}>
            Fue un fallo al arrancar, no un problema con tus datos: todo lo
            guardado sigue ahí. Reintenta y, si persiste, avísanos con el
            código de abajo.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              cursor: "pointer",
              border: 0,
              borderRadius: "0.625rem",
              background: "#2563eb",
              color: "#fff",
              fontSize: "0.875rem",
              fontWeight: 600,
              padding: "0.6rem 1.1rem",
            }}
          >
            Reintentar
          </button>
          {error.digest && (
            <p style={{ marginTop: "1.25rem", fontSize: "0.6875rem", color: "#6a6e78", fontFamily: "ui-monospace, monospace" }}>
              código: {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
