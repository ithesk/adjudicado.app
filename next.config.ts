import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
