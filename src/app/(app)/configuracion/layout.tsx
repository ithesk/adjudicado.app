import ConfigTabs from "./_tabs";
import { CabeceraPagina } from "@/components/ui";

export default function ConfiguracionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-5">
      <CabeceraPagina
        titulo="Configuración"
        descripcion="Catálogos reutilizables de tu organización."
      />
      <ConfigTabs />
      {children}
    </div>
  );
}
