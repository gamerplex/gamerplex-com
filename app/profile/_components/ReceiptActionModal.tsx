"use client";

import { useEffect, useMemo, useState } from "react";
import { PublicKey, Transaction } from "@solana/web3.js";
import {
  useAnchorWallet,
  useConnection,
  useWallet,
} from "@solana/wallet-adapter-react";
import { resolve } from "@bonfida/spl-name-service";

import {
  buildTransferReceiptIx,
  buildCloseReceiptIx,
  makeProgram,
  ARCADE_NETWORK,
} from "../../../lib/arcade/client";
import type { ReceiptSummary } from "../../../lib/arcade/profile";
import { shortAddr } from "../../../lib/arcade/profile";

type Mode = "transfer" | "close";

export function ReceiptActionModal({
  receipt,
  mode,
  onClose,
  onComplete,
}: {
  receipt: ReceiptSummary;
  mode: Mode;
  onClose: () => void;
  onComplete: (sig: string) => void;
}) {
  const { connection } = useConnection();
  const anchorWallet = useAnchorWallet();
  const { publicKey, sendTransaction } = useWallet();

  const [recipientRaw, setRecipientRaw] = useState("");
  const [resolvedRecipient, setResolvedRecipient] = useState<PublicKey | null>(null);
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmChecked, setConfirmChecked] = useState(false);

  // Debounced recipient resolution. Accepts .sol or base58 pubkey.
  useEffect(() => {
    if (mode !== "transfer") return;
    const raw = recipientRaw.trim();
    if (!raw) {
      setResolvedRecipient(null);
      setResolveError(null);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      setResolving(true);
      setResolveError(null);
      try {
        if (raw.toLowerCase().endsWith(".sol")) {
          const name = raw.toLowerCase().replace(/\.sol$/, "");
          const pk = await resolve(connection, name);
          if (!cancelled) {
            setResolvedRecipient(pk);
            setResolving(false);
          }
        } else {
          const pk = new PublicKey(raw);
          if (!cancelled) {
            setResolvedRecipient(pk);
            setResolving(false);
          }
        }
      } catch {
        if (!cancelled) {
          setResolvedRecipient(null);
          setResolveError("Not a valid wallet or .sol domain");
          setResolving(false);
        }
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [recipientRaw, connection, mode]);

  const sendingToSelf = useMemo(() => {
    if (!publicKey || !resolvedRecipient) return false;
    return publicKey.equals(resolvedRecipient);
  }, [publicKey, resolvedRecipient]);

  const canSubmit =
    !submitting &&
    confirmChecked &&
    (mode === "close" ||
      (mode === "transfer" && !!resolvedRecipient && !sendingToSelf));

  const explorerTx = (sig: string) => {
    const suf = ARCADE_NETWORK === "mainnet" ? "" : `?cluster=${ARCADE_NETWORK}`;
    return `https://explorer.solana.com/tx/${sig}${suf}`;
  };

  const onSubmit = async () => {
    if (!anchorWallet || !publicKey) {
      setError("Wallet not connected");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const program = makeProgram(connection, anchorWallet);
      const receiptPda = new PublicKey(receipt.pda);
      const tx = new Transaction();
      if (mode === "transfer") {
        if (!resolvedRecipient) throw new Error("No recipient resolved");
        tx.add(
          await buildTransferReceiptIx(program, publicKey, receiptPda, resolvedRecipient),
        );
      } else {
        tx.add(await buildCloseReceiptIx(program, publicKey, receiptPda));
      }
      const sig = await sendTransaction(tx, connection);
      await connection.confirmTransaction(sig, "confirmed");
      onComplete(sig);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Transaction failed");
    } finally {
      setSubmitting(false);
    }
  };

  const title = mode === "transfer" ? "Transfer receipt" : "Close receipt";

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(5, 5, 12, 0.85)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#0c0c14",
          border: "1px solid #252540",
          borderRadius: 12,
          padding: 24,
          maxWidth: 480,
          width: "100%",
          color: "#cfcfe0",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, margin: 0, color: "#e8e8f0" }}>{title}</h2>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", color: "#666", fontSize: 20, cursor: "pointer" }}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Receipt summary */}
        <div
          style={{
            padding: "10px 12px",
            background: "#050508",
            border: "1px solid #1a1a28",
            borderRadius: 8,
            marginBottom: 16,
            fontSize: 12,
          }}
        >
          <div style={{ color: "#8a8aa0", textTransform: "uppercase", letterSpacing: 1, fontSize: 10, marginBottom: 4 }}>
            Replay Receipt
          </div>
          <div style={{ color: "#e8e8f0", fontWeight: 600 }}>
            Game #{receipt.gameId} · <span style={{ color: "#14F195", fontFamily: "monospace" }}>{receipt.score.toLocaleString()}</span>
          </div>
          <div style={{ fontSize: 10, color: "#666", fontFamily: "monospace", marginTop: 4 }}>
            {shortAddr(receipt.pda)} · original: {shortAddr(receipt.originalPlayer)}
          </div>
        </div>

        {mode === "transfer" ? (
          <>
            <label style={{ fontSize: 12, color: "#a8a8c0", display: "block", marginBottom: 6 }}>
              Recipient wallet or .sol domain
            </label>
            <input
              type="text"
              autoFocus
              value={recipientRaw}
              onChange={(e) => setRecipientRaw(e.target.value)}
              placeholder="alice.sol  or  4FVw…mx8t"
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "10px 12px",
                background: "#050508",
                border: "1px solid #1a1a28",
                borderRadius: 8,
                color: "#e8e8f0",
                fontSize: 13,
                fontFamily: "monospace",
                outline: "none",
              }}
            />
            <div style={{ minHeight: 20, marginTop: 6, fontSize: 11 }}>
              {resolving && <span style={{ color: "#666" }}>Resolving…</span>}
              {resolveError && <span style={{ color: "#ff6b6b" }}>{resolveError}</span>}
              {resolvedRecipient && !resolveError && (
                <span style={{ color: "#14F195" }}>
                  ✓ Resolves to {shortAddr(resolvedRecipient.toBase58())}
                </span>
              )}
              {sendingToSelf && (
                <span style={{ color: "#ff9a40", marginLeft: 8 }}>That&rsquo;s your own wallet.</span>
              )}
            </div>

            <div
              style={{
                marginTop: 14,
                padding: "10px 12px",
                background: "#1a1a28",
                borderRadius: 8,
                fontSize: 11,
                color: "#8a8aa0",
                lineHeight: 1.5,
              }}
            >
              <strong style={{ color: "#ffd740" }}>Heads up:</strong> transfer is permanent. You give up ownership of this receipt. The{" "}
              <code style={{ background: "#0c0c14", padding: "0 4px", borderRadius: 3 }}>original_player</code> stays yours forever — leaderboard rank doesn&rsquo;t move.
            </div>
          </>
        ) : (
          <div
            style={{
              padding: "10px 12px",
              background: "#1a1a28",
              borderRadius: 8,
              fontSize: 11,
              color: "#a8a8c0",
              lineHeight: 1.6,
              marginBottom: 14,
            }}
          >
            Closing will <strong style={{ color: "#ff9a40" }}>delete the on-chain receipt</strong> and refund ~$0.33 in
            Solana rent to your wallet. Your GPX5 + GPX5R memos stay on-chain forever — only the receipt PDA is removed.
            {receipt.cnftWrapped && (
              <div style={{ color: "#ff6b6b", marginTop: 8 }}>
                ✗ This receipt is wrapped as a cNFT and cannot be closed directly. Unwrap first.
              </div>
            )}
          </div>
        )}

        <label
          style={{
            display: "flex",
            gap: 8,
            marginTop: 14,
            fontSize: 12,
            color: "#a8a8c0",
            cursor: mode === "close" && receipt.cnftWrapped ? "not-allowed" : "pointer",
            opacity: mode === "close" && receipt.cnftWrapped ? 0.4 : 1,
          }}
        >
          <input
            type="checkbox"
            checked={confirmChecked}
            disabled={mode === "close" && receipt.cnftWrapped}
            onChange={(e) => setConfirmChecked(e.target.checked)}
          />
          <span>
            {mode === "transfer"
              ? "I understand this transfer is final and cannot be undone."
              : "I understand closing deletes the receipt PDA permanently."}
          </span>
        </label>

        {error && (
          <div style={{ color: "#ff6b6b", fontSize: 12, marginTop: 10 }}>{error}</div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 20, justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            disabled={submitting}
            style={{
              padding: "8px 16px",
              borderRadius: 6,
              border: "1px solid #252540",
              background: "transparent",
              color: "#a8a8c0",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={onSubmit}
            disabled={!canSubmit}
            style={{
              padding: "8px 18px",
              borderRadius: 6,
              border: "none",
              background: canSubmit ? (mode === "transfer" ? "#14F195" : "#ff9a40") : "#252540",
              color: canSubmit ? "#050508" : "#666",
              fontSize: 13,
              fontWeight: 700,
              cursor: canSubmit ? "pointer" : "not-allowed",
            }}
          >
            {submitting
              ? "Waiting for wallet…"
              : mode === "transfer"
              ? "Transfer receipt"
              : "Close & refund rent"}
          </button>
        </div>

        <div style={{ fontSize: 10, color: "#555", marginTop: 12, textAlign: "center" }}>
          Gamerplex doesn&rsquo;t charge for this — just Solana gas ~$0.001.
        </div>
      </div>
    </div>
  );
}

export { explorerTxFor };

function explorerTxFor(sig: string): string {
  const suf = ARCADE_NETWORK === "mainnet" ? "" : `?cluster=${ARCADE_NETWORK}`;
  return `https://explorer.solana.com/tx/${sig}${suf}`;
}
