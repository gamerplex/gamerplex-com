import type { Metadata } from "next";

import DownloadView from "./DownloadView";

export const metadata: Metadata = {
  title: "Download Gamerplex — play in browser or install the app",
  description:
    "Play Gamerplex instantly in your browser, or install the app. Signed Android APK with published fingerprints; iOS via Add to Home Screen.",
};

export default function DownloadPage() {
  return <DownloadView />;
}
