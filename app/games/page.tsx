import { redirect } from "next/navigation";

// Consolidated: /arcade is the canonical games portal. /games redirects there.
export default function GamesRedirect() {
  redirect("/");
}
