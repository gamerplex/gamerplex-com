// Every user-facing route. Keep in sync with app/**/page.tsx. The availability
// suite iterates this list — a new page with no entry here is untested, so ADD IT.

// Content pages: must fully render (real content, no crash).
export const CONTENT_ROUTES = [
  '/',
  '/games',
  '/leaderboard',
  '/docs',
  '/privacy',
  '/terms',
  '/activity',
  '/bots',
  '/unavailable',
];

// Game pages: must MOUNT a playable shell (canvas / start / connect prompt), no crash.
export const GAME_ROUTES = [
  '/play/blockwords',
  '/play/chess',
  '/play/cyber-snake',
  '/play/cyber-snake-battle',
  '/play/flipball',
  '/play/magic-chess',
  '/play/magic-chess-live',
];

// Arcade (wallet/ToS-gated) pages: must render or redirect to a guard, no crash.
export const ARCADE_ROUTES = [
  '/arcade',
  '/arcade/blockwords',
  '/arcade/cyber-snake',
  '/picker-preview',
  '/profile',
];

// Dynamic routes: exercised with a sample param. Must NOT crash; may show an
// empty / "not found" state (that's a valid render, not a failure).
export const DYNAMIC_ROUTES = [
  '/challenge/e2e-sample',
  '/profile/So11111111111111111111111111111111111111112',
  '/replay/e2e-sample',
];

export const ALL_ROUTES = [...CONTENT_ROUTES, ...GAME_ROUTES, ...ARCADE_ROUTES, ...DYNAMIC_ROUTES];
