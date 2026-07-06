import { defineConfig } from "vitest/config";

// Unit-test runner. Kept strictly separate from the Playwright e2e/ suite:
// vitest would otherwise try to load e2e/*.spec.ts and crash on
// test.describe() (Playwright's runner, not vitest's). The `exclude` below is
// what keeps the two runners from colliding.
export default defineConfig({
  test: {
    // node env: targeted modules use node builtins (crypto, Buffer) and no DOM.
    environment: "node",
    // Only pick up *.test.ts(x). e2e specs are *.spec.ts and are excluded.
    include: ["**/*.test.ts", "**/*.test.tsx"],
    exclude: [
      "e2e/**",
      "node_modules/**",
      ".next/**",
      "_archive/**",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary"],
      include: [
        "lib/credits/play-token.ts",
        "lib/arcade/client.ts",
        "lib/arcade/tokens.ts",
        "lib/arcade/stables.ts",
        "lib/arcade/tos.ts",
        "lib/arcade/referral.ts",
        "lib/arcade/leaderboard.ts",
        "lib/arcade/profile.ts",
        "lib/arcade/flipcash.ts",
        "app/api/_lib/ratelimit.ts",
        "app/play/magic-chess/_arcade/score.ts",
        "app/play/blockwords/_arcade/engine.ts",
      ],
    },
  },
});
