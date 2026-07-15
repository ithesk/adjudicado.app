export default function LicitacionesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-xl font-semibold">Licitaciones</h1>
        <p className="text-sm text-muted">
          El expediente de cada proceso: ítems, requisitos y oferta — de la
          convocatoria al paquete listo para someter.
        </p>
      </div>
      {children}
    </div>
  );
}
