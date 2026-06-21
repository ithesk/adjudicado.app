import { listarSuplidores } from "@/lib/queries";
import SuplidoresEditor from "./SuplidoresEditor";

export const dynamic = "force-dynamic";

export default async function SuplidoresPage() {
  const suplidores = await listarSuplidores();
  return <SuplidoresEditor inicial={suplidores} />;
}
