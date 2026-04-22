import Link from "next/link";

const US_STATE_NAMES: Record<string, string> = {
  "US-AZ": "Arizona",
  "US-AR": "Arkansas",
  "US-CT": "Connecticut",
  "US-DE": "Delaware",
  "US-LA": "Louisiana",
  "US-MT": "Montana",
  "US-SC": "South Carolina",
  "US-SD": "South Dakota",
  "US-TN": "Tennessee",
  "US-VI": "the US Virgin Islands",
};

const COUNTRY_NAMES: Record<string, string> = {
  CU: "Cuba",
  IR: "Iran",
  KP: "North Korea",
  SY: "Syria",
  SG: "Singapore",
};

function regionLabel(code: string | undefined): string {
  if (!code) return "your region";
  if (US_STATE_NAMES[code]) return US_STATE_NAMES[code];
  if (COUNTRY_NAMES[code]) return COUNTRY_NAMES[code];
  return "your region";
}

export default async function UnavailablePage({
  searchParams,
}: {
  searchParams: Promise<{ region?: string }>;
}) {
  const { region } = await searchParams;
  const label = regionLabel(region);

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col">
      <header className="border-b border-neutral-800 px-6 py-4">
        <Link href="/" className="text-lg font-bold tracking-tight">
          Gamerplex
        </Link>
      </header>

      <div className="flex-1 flex items-center justify-center px-6">
        <div className="max-w-xl text-center">
          <div className="text-6xl mb-6">🌏</div>
          <h1 className="text-3xl font-bold mb-4">
            Not available in {label}
          </h1>
          <p className="text-neutral-300 mb-4">
            Gamerplex Arcade isn&rsquo;t available to players in {label} due
            to local laws about skill-based contests with monetary entry
            fees.
          </p>
          <p className="text-neutral-400 text-sm mb-8">
            We&rsquo;re working on expanding availability. In the meantime, you
            can still read about what we&rsquo;re building.
          </p>

          <div className="flex flex-wrap gap-3 justify-center">
            <Link
              href="/"
              className="px-4 py-2 rounded-md bg-neutral-800 text-neutral-100 hover:bg-neutral-700 text-sm"
            >
              About Gamerplex
            </Link>
            <Link
              href="/docs"
              className="px-4 py-2 rounded-md bg-neutral-800 text-neutral-100 hover:bg-neutral-700 text-sm"
            >
              Read the docs
            </Link>
            <Link
              href="/terms"
              className="px-4 py-2 rounded-md bg-neutral-800 text-neutral-100 hover:bg-neutral-700 text-sm"
            >
              Terms
            </Link>
          </div>

          <p className="text-xs text-neutral-500 mt-10">
            Region detected via IP geolocation. If you believe this is an
            error, contact{" "}
            <a href="mailto:support@gamerplex.com" className="underline">
              support@gamerplex.com
            </a>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
