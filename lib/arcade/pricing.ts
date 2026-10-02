// Fiat-canonical pricing for $GAME purchases.
//
// The price of record is USD. The $GAME amount is derived at spot, never fixed —
// a fixed $GAME number drifts with the token, so the discount would drift with
// it and the shop would be running an unintended FX position. It is also what
// R5's no-price-language rule protects against.
//
// Two floors constrain what can be charged, and they interact:
//
//   1. Flipcash will not transfer below its per-currency preset minimum —
//      $1 USD/AUD, ₱50 PHP (~$0.86). Same floor for a send, a tip and a DM.
//   2. The $GAME discount is applied BEFORE that floor is tested, so a $1 item
//      at 20% off lands at $0.80 and cannot be paid at all. The discount makes
//      the item unbuyable in the currency being discounted.
//
// So the DISCOUNTED price is what has to clear the floor, which puts the lowest
// workable base price at $1.25 and, with headroom, $1.50.

/** Lowest amount Flipcash will move, in USD. The highest regional preset minimum. */
export const FLIPCASH_MIN_USD = 1;

/** Paying in $GAME is cheaper than the stablecoin price. Charging less of it is
 *  not emitting it, so this stays inside R2. */
export const GAME_DISCOUNT = 0.2;

export interface PriceQuote {
  /** Price of record. */
  usd: number;
  /** What a $GAME payer owes, in USD terms. */
  usdInGame: number;
  /** The same amount denominated in $GAME at spot, or null with no rate. */
  game: number | null;
  /** Spot used, for display and for auditing a charge after the fact. */
  usdPerGame: number | null;
  /** False when the discounted price is under what Flipcash will transfer. */
  payableViaFlipcash: boolean;
  discount: number;
}

/** Quote an item. `usdPerGame` null (rate unavailable) still returns the USD side. */
export function quote(usd: number, usdPerGame: number | null, discount = GAME_DISCOUNT): PriceQuote {
  const usdInGame = round2(usd * (1 - discount));
  return {
    usd,
    usdInGame,
    game: usdPerGame && usdPerGame > 0 ? usdInGame / usdPerGame : null,
    usdPerGame,
    payableViaFlipcash: usdInGame >= FLIPCASH_MIN_USD,
    discount,
  };
}

/** Lowest base price whose discounted amount still clears the transfer floor. */
export function minimumBasePrice(discount = GAME_DISCOUNT): number {
  return round2(FLIPCASH_MIN_USD / (1 - discount));
}

/** $GAME amounts are shown to 2dp; the token's 10 decimals are not useful to a reader. */
export function formatGame(amount: number): string {
  return amount >= 100 ? Math.round(amount).toLocaleString() : amount.toFixed(2);
}

export function formatUsd(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
