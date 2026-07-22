import { redirect } from "next/navigation";

// Merged: home + arcade are one play-first landing now. /arcade → /.
export default function ArcadeRedirect() {
  redirect("/");
}
