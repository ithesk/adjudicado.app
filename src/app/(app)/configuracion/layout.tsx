import ConfigTabs from "./_tabs";

export default function ConfiguracionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-xl font-semibold">Configuración</h1>
        <p className="text-sm text-muted">
          Catálogos reutilizables de tu organización.
        </p>
      </div>
      <ConfigTabs />
      {children}
    </div>
  );
}
