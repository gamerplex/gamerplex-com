"use client";

import { ProfileView } from "../../profile/_components/ProfileView";

export default function AppProfile() {
  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "14px 14px 44px" }}>
      <ProfileView walletPubkey={null} isOwnProfile appMode />
    </div>
  );
}
