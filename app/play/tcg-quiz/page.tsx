import type { Metadata } from "next";
import TcgQuizMode from "./_arcade/TcgQuizMode";

export const metadata: Metadata = {
  title: "TCG Quiz — Gamerplex",
  description: "Real cards, real questions. Name the set, the artist, the year. Free to play.",
  openGraph: { title: "TCG Quiz — Gamerplex", description: "Real cards, real questions. Name the set, the artist, the year. Free to play.", type: "website", siteName: "Gamerplex", images: [{ url: "/games/tcg-quiz/og.png", width: 1200, height: 630, alt: "TCG Quiz on Gamerplex" }] },
  twitter: { card: "summary_large_image", site: "@gamerplex_com", title: "TCG Quiz — Gamerplex", description: "Real cards, real questions. Name the set, the artist, the year. Free to play.", images: ["/games/tcg-quiz/og.png"] },
};

export default function Page() {
  return (
    <>
      <h1 className="sr-only">TCG Quiz</h1>
      <TcgQuizMode />
    </>
  );
}
