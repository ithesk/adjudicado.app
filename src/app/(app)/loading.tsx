// Fallback instantáneo de navegación (docs/sistema-ui.md §carga): al clicar
// cualquier ruta, esta silueta aparece DE INMEDIATO mientras el servidor
// responde — nunca más una pantalla congelada sin feedback. Las fichas con
// riel tienen su propia silueta más fiel (orden/[id], licitaciones/[id]…).

import { EsqueletoPagina } from "@/components/ui";

export default function Loading() {
  return <EsqueletoPagina />;
}
