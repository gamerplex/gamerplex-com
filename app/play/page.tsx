import { redirect } from "next/navigation";

// /play has no index of its own — send visitors to the arcade (canonical portal).
export default function PlayIndex() {
  redirect("/");
}
