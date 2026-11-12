import { redirect } from "next/navigation";

/** Las aperturas viven ahora en /aperturas (compartido con el rol de consulta). */
export default function AperturasAntiguas() {
  redirect("/aperturas");
}
