import PreciosTabs from "./_tabs";
import { CabeceraPagina, Hoja } from "@/components/ui";

export default function PreciosLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Hoja ancho="ficha" className="space-y-5">
      <CabeceraPagina
        titulo="Precios"
        descripcion="Listas de precios de tus suplidores: búsqueda instantánea, términos de contrato e historial entre listas."
      />
      <PreciosTabs />
      {children}
    </Hoja>
  );
}
