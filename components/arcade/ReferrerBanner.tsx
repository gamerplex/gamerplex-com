"use client";

import { useEffect, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { getStoredReferrerInfo, pickReferrerFromUrl } from "../../lib/arcade/referral";

function shortPk(pk: PublicKey): string {
  const b = pk.toBase58();
  return `${b.slice(0, 4)}…${b.slice(-4)}`;
}

export default function ReferrerBanner({
  connectedWallet,
}: {
  connectedWallet: PublicKey | null;
}) {
  const [info, setInfo] = useState(() => getStoredReferrerInfo(connectedWallet));

  useEffect(() => {
    pickReferrerFromUrl(connectedWallet).then(() => {
      setInfo(getStoredReferrerInfo(connectedWallet));
    });
  }, [connectedWallet]);

  if (!info) return null;

  return (
    <div style={{
      fontSize: 11,
      padding: "8px 12px",
      background: "rgba(157,77,255,0.08)",
      border: "1px solid rgba(157,77,255,0.3)",
      borderRadius: 8,
      color: "rgba(255,255,255,0.85)",
      marginBottom: 12,
      lineHeight: 1.5,
    }}>
      Referred by{" "}
      <strong style={{ color: "#b388ff", fontFamily: "monospace" }}>
        {shortPk(info.pubkey)}
      </strong>
      {info.source === "url-hint-verified-onchain" && (
        <span style={{ color: "#00ffd1", marginLeft: 6, fontWeight: 700 }}>✓ on-chain verified</span>
      )}
      <div style={{ opacity: 0.6, fontSize: 10, marginTop: 2 }}>
        They earn 20% of your save fee. Permanent attribution after first save.
      </div>
    </div>
  );
}
