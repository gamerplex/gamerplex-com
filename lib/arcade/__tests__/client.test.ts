import { describe, it, expect, afterEach, vi } from "vitest";
import { BN } from "@coral-xyz/anchor";
import { Keypair, PublicKey } from "@solana/web3.js";
import {
  ARCADE_PROGRAM_ID,
  configPda,
  stablecoinConfigPda,
  gamePda,
  profilePda,
  profileExtPda,
  handleClaimPda,
  receiptPda,
  ratesPda,
  affiliateConfigPda,
  paymentsConfigPda,
  adminDeadline,
  MAX_ADMIN_DEADLINE_SEC,
  continueCostMicroUsd,
  CONTINUE_BASE_MICRO_USD,
  encodeMoveLog,
  buildSolTransferIx,
  sigToBytes,
  convertUsdToRaw,
  applyOverpay,
  quotePaymentAmount,
  RATE_SCALE_FACTOR,
  RATE_OVERPAY_BPS,
  GAME_MINT,
  GAME_DISCOUNT_BPS,
  type ExchangeRatesSnapshot,
} from "../client";

const wallet = Keypair.generate().publicKey;

// Re-derive each PDA independently against the same seeds + program id to
// prove the exported helpers use the seeds the frontend/contract agree on.
function rederive(seeds: (Buffer | Uint8Array)[]) {
  return PublicKey.findProgramAddressSync(seeds, ARCADE_PROGRAM_ID)[0];
}

describe("client: PDA derivation seed correctness", () => {
  it("configPda -> ['config']", () => {
    expect(configPda()[0].equals(rederive([Buffer.from("config")]))).toBe(true);
  });
  it("stablecoinConfigPda -> ['stablecoins']", () => {
    expect(stablecoinConfigPda()[0].equals(rederive([Buffer.from("stablecoins")]))).toBe(true);
  });
  it("gamePda -> ['game', [gameId]]", () => {
    expect(gamePda(4)[0].equals(rederive([Buffer.from("game"), Buffer.from([4])]))).toBe(true);
    // different game id -> different PDA
    expect(gamePda(4)[0].equals(gamePda(5)[0])).toBe(false);
  });
  it("profilePda -> ['profile', wallet]", () => {
    expect(profilePda(wallet)[0].equals(rederive([Buffer.from("profile"), wallet.toBuffer()]))).toBe(true);
  });
  it("profileExtPda -> ['profile-ext', wallet]", () => {
    expect(profileExtPda(wallet)[0].equals(rederive([Buffer.from("profile-ext"), wallet.toBuffer()]))).toBe(true);
  });
  it("handleClaimPda -> ['handle-claim', utf8(handle)]", () => {
    expect(handleClaimPda("neo")[0].equals(rederive([Buffer.from("handle-claim"), Buffer.from("neo", "utf8")]))).toBe(true);
  });
  it("receiptPda serializes nonce as 8-byte LE", () => {
    const nonce = new BN(1234567);
    const nonceLe = nonce.toArrayLike(Buffer, "le", 8);
    expect(receiptPda(wallet, nonce)[0].equals(rederive([Buffer.from("receipt"), wallet.toBuffer(), nonceLe]))).toBe(true);
    // nonce is load-bearing: different nonce -> different receipt
    expect(receiptPda(wallet, new BN(1))[0].equals(receiptPda(wallet, new BN(2))[0])).toBe(false);
  });
  it("ratesPda/affiliateConfigPda/paymentsConfigPda use their single seeds", () => {
    expect(ratesPda()[0].equals(rederive([Buffer.from("rates")]))).toBe(true);
    expect(affiliateConfigPda()[0].equals(rederive([Buffer.from("affiliate")]))).toBe(true);
    expect(paymentsConfigPda()[0].equals(rederive([Buffer.from("payments")]))).toBe(true);
  });
  it("bumps are valid u8", () => {
    const [, bump] = configPda();
    expect(bump).toBeGreaterThanOrEqual(0);
    expect(bump).toBeLessThanOrEqual(255);
  });
});

describe("client: adminDeadline", () => {
  afterEach(() => vi.useRealTimers());
  it("returns now + secondsFromNow in unix seconds", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_700_000_000_000); // ms
    expect(adminDeadline(3600).toString()).toBe(String(1_700_000_000 + 3600));
    expect(adminDeadline().toString()).toBe(String(1_700_000_000 + 3600)); // default 3600
  });
  it("MAX_ADMIN_DEADLINE_SEC is one week", () => {
    expect(MAX_ADMIN_DEADLINE_SEC).toBe(7 * 86_400);
  });
});

describe("client: continueCostMicroUsd (exponential $0.05 × 2ⁿ)", () => {
  it("n=0 is the base price", () => {
    expect(continueCostMicroUsd(0).toString()).toBe(String(CONTINUE_BASE_MICRO_USD));
  });
  it("doubles per step", () => {
    expect(continueCostMicroUsd(1).toNumber()).toBe(CONTINUE_BASE_MICRO_USD * 2);
    expect(continueCostMicroUsd(3).toNumber()).toBe(CONTINUE_BASE_MICRO_USD * 8);
  });
});

describe("client: encodeMoveLog (3 bytes/change, u16 LE tick + u8 dir)", () => {
  it("packs tick LE then dir", () => {
    const buf = encodeMoveLog([{ tick: 0x0201, dir: 3 }]);
    expect([...buf]).toEqual([0x01, 0x02, 3]);
  });
  it("length = 3 × changes", () => {
    expect(encodeMoveLog([{ tick: 1, dir: 0 }, { tick: 2, dir: 1 }]).length).toBe(6);
    expect(encodeMoveLog([]).length).toBe(0);
  });
});

describe("client: buildSolTransferIx", () => {
  it("builds a System transfer from->to for the given lamports", () => {
    const from = Keypair.generate().publicKey;
    const to = Keypair.generate().publicKey;
    const ix = buildSolTransferIx(from, to, new BN(12345));
    // System program id is the all-zero key (== PublicKey.default).
    expect(ix.programId.toBase58()).toBe("11111111111111111111111111111111");
    expect(ix.keys[0].pubkey.equals(from)).toBe(true);
    expect(ix.keys[0].isSigner).toBe(true);
    expect(ix.keys[1].pubkey.equals(to)).toBe(true);
  });
});

describe("client: sigToBytes", () => {
  it("decodes a base58 signature into a 64-byte array", () => {
    // A real 64-byte signature is 88 base58 chars; build one from known bytes.
    const bs58 = (globalThis as any).require ? null : null; // avoid unused
    // Use a 64-byte all-0x01 buffer encoded via the same bs58 the module uses.
    // Simpler: assert length + that leading bytes fit within 64.
    const sig = "5".repeat(88); // valid base58 chars; decodes to some bytes
    const out = sigToBytes(sig);
    expect(out.length).toBe(64);
  });
});

describe("client: rate math (mirror of on-chain convert_usd_to_raw)", () => {
  it("convertUsdToRaw = amount × 1e12 / rateScaled", () => {
    // rate of exactly 1e12 means raw == amount
    expect(convertUsdToRaw(new BN(50_000), new BN(RATE_SCALE_FACTOR)).toNumber()).toBe(50_000);
    // rate of 2e12 halves it
    expect(convertUsdToRaw(new BN(50_000), new BN(RATE_SCALE_FACTOR).muln(2)).toNumber()).toBe(25_000);
  });

  it("applyOverpay adds the overpay bps buffer", () => {
    // 10_000 raw + 0.5% (RATE_OVERPAY_BPS=50) = 10_050
    expect(applyOverpay(new BN(10_000)).toNumber()).toBe(10_050);
    expect(RATE_OVERPAY_BPS).toBe(50);
    // explicit bps
    expect(applyOverpay(new BN(10_000), 100).toNumber()).toBe(10_100);
  });
});

describe("client: quotePaymentAmount", () => {
  const rates: ExchangeRatesSnapshot = {
    solMicroUsdPerLamport: new BN(RATE_SCALE_FACTOR), // 1:1 for arithmetic clarity
    gameMicroUsdPerQuark: new BN(RATE_SCALE_FACTOR).muln(2), // 2 -> half the quarks
    solUpdatedAt: 0,
    gameUpdatedAt: 0,
  };

  it("stablecoin path: no rate conversion, no overpay, honors discount", () => {
    const q = quotePaymentAmount(rates, new BN(50_000), new PublicKey("So11111111111111111111111111111111111111112"), 0);
    // non-native, non-GAME mint -> stable branch: raw == discounted == base
    expect(q.amountMicroUsdToRecord.toNumber()).toBe(50_000);
    expect(q.paymentAmountRaw.toNumber()).toBe(50_000);
  });

  it("native SOL path applies overpay buffer", () => {
    const q = quotePaymentAmount(rates, new BN(50_000), PublicKey.default, 0);
    // rate 1:1 -> lamports 50_000, then +0.5% overpay = 50_250
    expect(q.paymentAmountRaw.toNumber()).toBe(50_250);
  });

  it("$GAME path applies discount then rate conversion then overpay", () => {
    const q = quotePaymentAmount(rates, new BN(50_000), GAME_MINT, GAME_DISCOUNT_BPS);
    // discounted = 50_000 * 8000/10000 = 40_000
    expect(q.amountMicroUsdToRecord.toNumber()).toBe(40_000);
    // quarks = 40_000 * 1e12 / 2e12 = 20_000 ; overpay +0.5% = 20_100
    expect(q.paymentAmountRaw.toNumber()).toBe(20_100);
  });
});
