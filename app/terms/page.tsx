"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

import {
  LATEST_TOS_VERSION,
  hasAcceptedCurrent,
  signAndStore,
} from "../../lib/arcade/tos";

const LAST_UPDATED = "2026-04-22";

// Safe-list of return paths to prevent open-redirect. Must start with `/` and
// be one of the known arcade/product paths.
function safeReturn(raw: string | null): string {
  if (!raw) return "/arcade";
  if (!raw.startsWith("/")) return "/arcade";
  if (raw.startsWith("//")) return "/arcade";
  return raw;
}

export default function TermsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = useMemo(
    () => safeReturn(searchParams.get("return")),
    [searchParams],
  );

  const { publicKey, signMessage, connected } = useWallet();

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [hasScrolled, setHasScrolled] = useState(false);
  const [agreeTos, setAgreeTos] = useState(false);
  const [agree18, setAgree18] = useState(false);
  const [agreeJurisdiction, setAgreeJurisdiction] = useState(false);
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [alreadyAccepted, setAlreadyAccepted] = useState(false);

  useEffect(() => {
    if (publicKey && hasAcceptedCurrent(publicKey)) {
      setAlreadyAccepted(true);
    } else {
      setAlreadyAccepted(false);
    }
  }, [publicKey]);

  const onScroll = () => {
    const el = scrollerRef.current;
    if (!el) return;
    const scrolled = el.scrollTop + el.clientHeight;
    const total = el.scrollHeight;
    if (total > 0 && scrolled / total >= 0.8) {
      setHasScrolled(true);
    }
  };

  const canSign =
    connected &&
    !!publicKey &&
    !!signMessage &&
    hasScrolled &&
    agreeTos &&
    agree18 &&
    agreeJurisdiction &&
    !signing;

  const onSign = async () => {
    if (!publicKey || !signMessage) return;
    setError(null);
    setSigning(true);
    try {
      await signAndStore(publicKey, signMessage);
      router.push(returnTo);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Signature rejected. You must sign to continue.",
      );
    } finally {
      setSigning(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col">
      <header className="border-b border-neutral-800 px-6 py-4 flex items-center justify-between">
        <Link href="/" className="text-lg font-bold tracking-tight">
          Gamerplex
        </Link>
        <div className="text-xs text-neutral-400">
          Terms v{LATEST_TOS_VERSION} · Last updated {LAST_UPDATED}
        </div>
      </header>

      <div
        ref={scrollerRef}
        onScroll={onScroll}
        className="flex-1 overflow-y-auto px-6 py-8 max-w-3xl mx-auto w-full"
      >
        <h1 className="text-3xl font-bold mb-2">Terms of Service</h1>
        <p className="text-sm text-neutral-400 mb-8">
          DRAFT — pending counsel review. By signing below, you agree to these
          terms as they apply to Gamerplex Arcade.
        </p>

        <TermsBody />

        <div className="h-32" />
      </div>

      <footer className="border-t border-neutral-800 bg-neutral-900/95 backdrop-blur px-6 py-5 sticky bottom-0">
        <div className="max-w-3xl mx-auto w-full space-y-3">
          {alreadyAccepted ? (
            <div className="flex items-center justify-between">
              <div className="text-sm text-emerald-400">
                ✓ You have already accepted Terms v{LATEST_TOS_VERSION} with
                this wallet.
              </div>
              <button
                onClick={() => router.push(returnTo)}
                className="px-4 py-2 rounded-md bg-emerald-500 text-neutral-950 font-semibold text-sm hover:bg-emerald-400"
              >
                Continue →
              </button>
            </div>
          ) : !connected ? (
            <div className="flex items-center justify-between gap-4">
              <div className="text-sm text-neutral-300">
                Connect your wallet to sign and accept.
              </div>
              <WalletMultiButton />
            </div>
          ) : (
            <>
              {!hasScrolled && (
                <div className="text-xs text-neutral-400">
                  Scroll through the full terms to enable the checkboxes.
                </div>
              )}
              <label
                className={`flex items-start gap-2 text-sm ${hasScrolled ? "text-neutral-200" : "text-neutral-500"}`}
              >
                <input
                  type="checkbox"
                  disabled={!hasScrolled}
                  checked={agreeTos}
                  onChange={(e) => setAgreeTos(e.target.checked)}
                  className="mt-1"
                />
                <span>
                  I have read and agree to the Terms of Service and{" "}
                  <Link href="/privacy" className="underline">
                    Privacy Policy
                  </Link>
                  .
                </span>
              </label>
              <label
                className={`flex items-start gap-2 text-sm ${hasScrolled ? "text-neutral-200" : "text-neutral-500"}`}
              >
                <input
                  type="checkbox"
                  disabled={!hasScrolled}
                  checked={agree18}
                  onChange={(e) => setAgree18(e.target.checked)}
                  className="mt-1"
                />
                <span>I confirm I am at least 18 years of age.</span>
              </label>
              <label
                className={`flex items-start gap-2 text-sm ${hasScrolled ? "text-neutral-200" : "text-neutral-500"}`}
              >
                <input
                  type="checkbox"
                  disabled={!hasScrolled}
                  checked={agreeJurisdiction}
                  onChange={(e) => setAgreeJurisdiction(e.target.checked)}
                  className="mt-1"
                />
                <span>
                  I confirm I am not a resident of a prohibited jurisdiction
                  (AZ, AR, CT, DE, LA, MT, SC, SD, TN, USVI, or any sanctioned
                  country).
                </span>
              </label>

              {error && (
                <div className="text-sm text-red-400">{error}</div>
              )}

              <div className="flex items-center justify-between pt-1">
                <div className="text-xs text-neutral-500">
                  Signing is free — no transaction fee, no gas.
                </div>
                <button
                  disabled={!canSign}
                  onClick={onSign}
                  className="px-5 py-2.5 rounded-md bg-emerald-500 text-neutral-950 font-semibold text-sm hover:bg-emerald-400 disabled:bg-neutral-700 disabled:text-neutral-500 disabled:cursor-not-allowed"
                >
                  {signing ? "Waiting for wallet…" : "Sign & Accept"}
                </button>
              </div>
            </>
          )}
        </div>
      </footer>
    </div>
  );
}

function TermsBody() {
  return (
    <div className="prose prose-invert prose-sm max-w-none space-y-6">
      <section>
        <h2 className="text-xl font-semibold mb-2">1. About Gamerplex Arcade</h2>
        <p>
          Gamerplex Arcade (&ldquo;the Service&rdquo;) is a collection of
          single-player skill games operated by Gamerplex Pty Ltd, an Australian
          company (&ldquo;we&rdquo;, &ldquo;us&rdquo;). The Service runs on the
          Solana blockchain and allows you to record scores, save replays, and
          mint replay receipts using your self-custodied wallet.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-2">2. Not Gambling</h2>
        <p>
          The Service is a pure-skill game. Fees paid to record scores, save
          replays, or mint receipts are for the persistent storage of your game
          result on a public blockchain — not a wager, bet, or chance-based
          contest. There is no prize pool, no win condition tied to a payment,
          and no randomness affecting outcome beyond the initial seed which is
          publicly committed before play.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-2">3. Eligibility</h2>
        <p>
          You must be at least 18 years of age to use the Service. You must not
          use the Service if you are a resident of: Arizona, Arkansas,
          Connecticut, Delaware, Louisiana, Montana, South Carolina, South
          Dakota, Tennessee, the US Virgin Islands, or any country subject to
          comprehensive US, EU, UK, AU, or UN sanctions (including but not
          limited to Cuba, Iran, North Korea, Syria, Crimea, Donetsk, and
          Luhansk).
        </p>
        <p>
          We may block access based on IP geolocation. Circumventing these
          controls (via VPN or otherwise) is a material breach of these terms
          and may result in forfeiture of any on-chain records associated with
          your wallet being supported by Gamerplex frontend infrastructure (the
          records themselves remain on-chain; we simply will not display them
          or offer support).
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-2">4. Fees and Services</h2>
        <p>
          The Service charges non-refundable fees in USDC for the following:
        </p>
        <ul className="list-disc list-inside space-y-1">
          <li>Saving your score to the global leaderboard: $0.05 USDC</li>
          <li>
            Saving a verified replay (inline move log on-chain): $0.15 USDC
          </li>
          <li>
            Minting a transferable Replay Receipt (on-chain PDA you own):
            $0.25 USDC + refundable network rent (~$0.33)
          </li>
          <li>
            Wrapping a Replay Receipt as a compressed NFT (planned v1.3):
            $0.50 USDC
          </li>
        </ul>
        <p>
          All fees are final upon on-chain confirmation. Solana network fees
          (gas) are separate and paid to validators, not to us. Refundable rent
          is returned to you automatically when you close the underlying
          account.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-2">5. Your Wallet, Your Responsibility</h2>
        <p>
          You alone control your wallet and private keys. We never have access
          to your funds or keys. We cannot reverse transactions, recover lost
          keys, or refund fees mistakenly paid. Loss of your wallet means
          permanent loss of access to records tied to it — keep your seed phrase
          secure.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-2">6. On-Chain Records</h2>
        <p>
          Your scores, replays, and receipts are recorded on the public Solana
          blockchain. These records are permanent, publicly visible, and
          outside our control. We do not promise that our frontend will always
          display them, but the records themselves survive independent of us.
        </p>
        <p>
          Leaderboard rankings are always keyed to the original player&rsquo;s
          wallet address, which is immutable at the time of record. Transferring
          a Replay Receipt to another wallet does not transfer leaderboard
          position.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-2">7. Prohibited Conduct</h2>
        <p>You agree not to:</p>
        <ul className="list-disc list-inside space-y-1">
          <li>Use automated tools, bots, or scripts to play the games</li>
          <li>
            Attempt to exploit, reverse-engineer, or tamper with the smart
            contracts or frontend
          </li>
          <li>Submit fraudulent scores or replay data</li>
          <li>
            Farm payments in ways designed to manipulate revenue or referral
            rewards
          </li>
          <li>Use the Service to launder funds or evade sanctions</li>
          <li>
            Impersonate another player or misrepresent your jurisdiction or age
          </li>
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-2">8. No Warranties</h2>
        <p>
          The Service is provided &ldquo;as is&rdquo;. We do not warrant that it
          will be available, bug-free, or secure. We are not liable for any loss
          arising from smart-contract bugs, blockchain forks, validator
          downtime, or third-party wallet issues. Your use is at your own risk.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-2">9. Limitation of Liability</h2>
        <p>
          To the maximum extent permitted by law, our total liability arising
          out of or in connection with the Service will not exceed the greater
          of AUD 100 or the total fees you have paid us in the 12 months
          preceding the claim. We are not liable for indirect, consequential,
          or incidental damages.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-2">10. Changes to These Terms</h2>
        <p>
          We may update these terms. Material changes will bump the version
          number, and you will be required to re-sign before continuing to use
          the Service. Your prior signatures are retained as a record of the
          terms you agreed to at that time.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-2">11. Governing Law</h2>
        <p>
          These terms are governed by the laws of New South Wales, Australia.
          Disputes will be resolved in the courts of New South Wales, unless
          consumer protection laws in your jurisdiction grant you additional
          rights that cannot be waived.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-2">12. Contact</h2>
        <p>
          Questions: <a href="mailto:legal@gamerplex.com" className="underline">legal@gamerplex.com</a>
        </p>
      </section>
    </div>
  );
}
