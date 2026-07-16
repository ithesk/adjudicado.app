import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // El generador lee las plantillas del disco con rutas dinámicas: sin esto,
  // funciona en dev y explota en Vercel con ENOENT (el tracer no las ve).
  outputFileTracingIncludes: {
    "/api/licitaciones/[id]/generar": [
      "./plantillas/dgcp/*-tpl.docx",
      "./plantillas/cartas/*-tpl.docx",
    ],
  },
  experimental: {
    serverActions: {
      // Las server actions reciben archivos (documentos de empresa, archivos
      // de requisitos de licitaciones). El default de 1 MB rechaza cualquier
      // PDF real ("Body exceeded 1 MB limit"); el tope de la app es 15 MB.
      bodySizeLimit: "20mb",
    },
  },
};

export default nextConfig;
