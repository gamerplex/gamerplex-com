import { redirect } from "next/navigation";

export default function ArcadeBlockwordsRedirect() {
  redirect("/play/blockwords?mode=arcade");
}
