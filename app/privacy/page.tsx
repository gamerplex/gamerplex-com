import Link from "next/link";

const LAST_UPDATED = "2026-04-22";
const VERSION = "1.2";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <header className="border-b border-neutral-800 px-6 py-4 flex items-center justify-between">
        <Link href="/" className="text-lg font-bold tracking-tight">
          Gamerplex
        </Link>
        <div className="text-xs text-neutral-400">
          Privacy v{VERSION} · Last updated {LAST_UPDATED}
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-8">
        <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
        <p className="text-sm text-neutral-400 mb-8">
          DRAFT — pending counsel review.
        </p>

        <div className="prose prose-invert prose-sm max-w-none space-y-6">
          <section>
            <h2 className="text-xl font-semibold mb-2">What we collect</h2>
            <p>
              Gamerplex Arcade is designed to minimize data collection. We do
              not require an email, username, or password. We do not track
              you across the web. We do not sell or share data with third
              parties for advertising purposes.
            </p>
            <p>We collect only:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>
                <strong>Your wallet public key</strong>, when you connect a
                wallet. This is a public identifier on the Solana blockchain.
              </li>
              <li>
                <strong>IP address and approximate geolocation</strong>, for
                the purpose of enforcing jurisdictional restrictions as set
                out in our Terms of Service.
              </li>
              <li>
                <strong>Terms of Service acceptance records</strong>: a copy
                of the message you signed, your wallet address, version, and
                timestamp. Stored to demonstrate your consent in case of
                dispute.
              </li>
              <li>
                <strong>Aggregate gameplay metadata</strong>: scores, session
                duration, game choices. This is also recorded on-chain and is
                publicly visible.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">
              What is permanent on-chain
            </h2>
            <p>
              Anything you submit as part of a paid action (score, replay
              move-log, Replay Receipt) is recorded on the public Solana
              blockchain and is outside our ability to delete. This is a
              property of the blockchain, not a choice we made. Do not submit
              anything to chain that you would not be comfortable being
              public and permanent.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">Cookies and storage</h2>
            <p>
              We use <strong>localStorage</strong> in your browser to remember
              your Terms of Service acceptance signature and cached game
              state. We do not use third-party analytics cookies, advertising
              pixels, or tracking beacons.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">Your rights</h2>
            <p>
              You can clear all locally-stored data at any time via your
              browser settings. You can disconnect your wallet at any time.
              On-chain records cannot be deleted by us or anyone else — this
              is a fundamental property of public blockchains.
            </p>
            <p>
              If you are in the EU, UK, or another jurisdiction with data
              protection laws, you may have additional rights regarding off-chain
              data we hold about you (ToS signatures, geolocation logs).
              Contact us to exercise those rights.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">Data retention</h2>
            <p>
              Off-chain records (ToS signatures, geolocation logs) are
              retained for as long as we operate the Service, plus a
              reasonable period to defend against legal claims (typically
              7 years).
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">Contact</h2>
            <p>
              Privacy questions:{" "}
              <a
                href="mailto:privacy@gamerplex.com"
                className="underline"
              >
                privacy@gamerplex.com
              </a>
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
