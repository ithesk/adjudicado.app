import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Probar el DEV server desde el teléfono (http://<ip-del-mac>:3000): sin
  // esto, Next 16 bloquea los assets pedidos desde otro origen y la página
  // carga SIN JavaScript — nada interactivo funciona. Solo afecta a dev.
  // Si la IP del Mac cambia (DHCP), agregar la nueva aquí.
  allowedDevOrigins: ["192.168.2.94", "192.168.2.107"],
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
    // El SEGUNDO tope, y el que de verdad rompía las subidas: con un proxy
    // (src/proxy.ts, que matchea todo salvo estáticos) Next copia el cuerpo a
    // memoria para poder leerlo dos veces, y ese búfer son 10 MB por defecto.
    // Un PDF de 12 MB llegaba CORTADO: el multipart quedaba a medias y la
    // action moría con "Unexpected end of form" (500) sin llegar nunca a la
    // validación de tamaño. Next no falla ni avisa al cliente — solo trunca.
    // 32 MB cubre lo más grande que acepta la app (la lista de precios, 30 MB).
    proxyClientMaxBodySize: "32mb",
  },
};

export default nextConfig;
