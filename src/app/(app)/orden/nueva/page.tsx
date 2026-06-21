import NuevaOrdenForm from "./NuevaOrdenForm";

export default function NuevaOrdenPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-1 font-display text-xl font-semibold">Nueva orden</h1>
      <p className="mb-6 text-sm text-muted">
        Sube el PDF de la orden de compra. El sistema extrae los datos; tú solo
        confirmas y pones el plazo de entrega.
      </p>
      <NuevaOrdenForm />
    </div>
  );
}
