"use client";

// Dev preview route for the StartPagePicker (used by the Playwright test).
// Not linked from the app.
import { useState } from "react";
import { StartPagePicker, type GameMode } from "../../components/games/StartPagePicker";

export default function PickerPreviewPage() {
  const [picked, setPicked] = useState<GameMode | null>(null);
  return (
    <div style={{ padding: 32, color: "#e8e8f0", background: "#0a0a14", minHeight: "100vh" }}>
      <h1 style={{ fontSize: 20, marginBottom: 16 }}>StartPagePicker preview — magic-chess (arena-enabled)</h1>
      <StartPagePicker manifest={{ slug: "magic-chess", supportsArena: true }} onSelect={setPicked} />
      {picked && (
        <div data-testid="picked" style={{ marginTop: 20, color: "#14F195" }}>
          picked: {picked}
        </div>
      )}
    </div>
  );
}
