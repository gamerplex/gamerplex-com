import type { Metadata } from "next";
import TcgQuizMode from "./_arcade/TcgQuizMode";

export const metadata: Metadata = {
  title: "TCG Quiz — Gamerplex",
  description: "Real cards, real questions. Name the set, the artist, the year. Free to play.",
};

export default function Page() {
  return <TcgQuizMode />;
}
