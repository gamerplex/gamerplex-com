"use client";

import { CommunityView } from "../../community/_components/CommunityView";

export default function AppCommunity() {
  return (
    <>
      {/* The page's name for assistive tech. The design opens straight into
          content, so the heading is not painted. */}
      <h1 style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden',
        clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>Community</h1>
      <CommunityView />
    </>
  );
}
