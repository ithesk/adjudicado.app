import type { Metadata } from "next";
import AuthForm from "./AuthForm";

export const metadata: Metadata = {
  title: "Entrar — adjudicado.app",
};

export default function LoginPage() {
  return <AuthForm modo="entrar" />;
}
