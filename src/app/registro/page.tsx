import type { Metadata } from "next";
import AuthForm from "../login/AuthForm";

export const metadata: Metadata = {
  title: "Crear cuenta — adjudicado.app",
  description:
    "Crea el espacio de tu empresa en minutos. Seguimiento de licitaciones, de la orden de compra al cobro.",
};

export default function RegistroPage() {
  return <AuthForm modo="crear" />;
}
