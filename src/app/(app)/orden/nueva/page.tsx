import NuevaOrdenForm from "./NuevaOrdenForm";
import { CabeceraPagina, Hoja } from "@/components/ui";

export default function NuevaOrdenPage() {
  return (
    <Hoja ancho="form" className="mx-auto space-y-5">
      <CabeceraPagina
        volver="/"
        titulo="Nueva orden"
        descripcion="Sube el PDF de la orden de compra. El sistema extrae los datos; tú solo confirmas y pones el plazo de entrega."
      />
      <NuevaOrdenForm />
    </Hoja>
  );
}
