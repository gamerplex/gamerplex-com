import { redirect } from "next/navigation";

// The duel spectator surface (this page) requires a CLI-spawned match and is
// tied to the Tournaments product, which is deferred until arcade revenue
// funds CM v2.2. Until then, anyone landing here gets routed to the playable
// arcade solo experience.
export default function PlayCyberSnakeRedirect() {
  redirect("/arcade/cyber-snake");
}
