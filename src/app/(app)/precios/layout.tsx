import PreciosTabs from "./_tabs";

export default function PreciosLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-xl font-semibold">Precios</h1>
        <p className="text-sm text-muted">
          Listas de precios de tus suplidores: búsqueda instantánea, términos de
          contrato e historial entre listas.
        </p>
      </div>
      <PreciosTabs />
      {children}
    </div>
  );
}
