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
  sha256,
  convertUsdToRaw,
  applyOverpay,
  quotePaymentAmount,
  RATE_SCALE_FACTOR,
  RATE_OVERPAY_BPS,
  GAME_MINT,
  GAME_DISCOUNT_BPS,
  fetchProfile,
  buildOpenProfileIx,
  buildSubmitScoreIx,
  buildRecordPaymentIx,
  buildInitExchangeRatesIx,
  buildUpdateExchangeRatesIx,
  buildInitAffiliateConfigIx,
  buildSetAffiliateEnabledIx,
  buildSetAffiliateMinAccrualIx,
  buildCommitReplayIx,
  buildInitStablecoinsIx,
  buildUpdateStablecoinsIx,
  buildUsdcTransferIxs,
  buildSplTransferIxs,
  buildMintReceiptIx,
  buildTransferReceiptIx,
  buildCloseReceiptIx,
  buildSetHandleIx,
  buildUpdateBioIx,
  getTreasuryWallet,
  fetchExchangeRates,
  buildBuyGameAndPayIxs,
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

describe("client: sha256", () => {
  it("returns the 32-byte SHA-256 of the input (known vector)", async () => {
    // SHA-256("abc") known digest.
    const out = await sha256(new Uint8Array([0x61, 0x62, 0x63]));
    expect(out.length).toBe(32);
    const hex = [...out].map((b) => b.toString(16).padStart(2, "0")).join("");
    expect(hex).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});

// ── Async instruction builders ──────────────────────────────────────────
// These wrap Anchor's `program.methods.X(...).accounts(...).instruction()`
// chain. We stub a minimal fake Program that records the method name + the
// accounts object and returns a sentinel instruction, so we can assert the
// builder fed the right PDAs without touching a real RPC/IDL.

type Recorded = { method: string; args: any[]; accounts: any };

function fakeProgram() {
  const calls: Recorded[] = [];
  const methods = new Proxy(
    {},
    {
      get: (_t, method: string) => (...args: any[]) => {
        const rec: Recorded = { method, args, accounts: null };
        const chain = {
          accounts: (a: any) => {
            rec.accounts = a;
            return chain;
          },
          accountsPartial: (a: any) => {
            rec.accounts = a;
            return chain;
          },
          instruction: async () => {
            calls.push(rec);
            return { __ix: method, accounts: rec.accounts, args };
          },
        };
        return chain;
      },
    },
  );
  return { program: { methods } as any, calls };
}

const player = Keypair.generate().publicKey;
const admin = Keypair.generate().publicKey;

describe("client: async instruction builders feed correct PDAs", () => {
  it("buildOpenProfileIx: null referrerProfile for PublicKey.default", async () => {
    const { program } = fakeProgram();
    const ix: any = await buildOpenProfileIx(program, player, PublicKey.default);
    expect(ix.__ix).toBe("openPlayerProfile");
    expect(ix.accounts.profile.equals(profilePda(player)[0])).toBe(true);
    expect(ix.accounts.referrerProfile).toBeNull();
  });

  it("buildOpenProfileIx: derives referrerProfile when a referrer is given", async () => {
    const { program } = fakeProgram();
    const referrer = Keypair.generate().publicKey;
    const ix: any = await buildOpenProfileIx(program, player, referrer);
    expect(ix.accounts.referrerProfile.equals(profilePda(referrer)[0])).toBe(true);
  });

  it("buildSubmitScoreIx: defaults gameId to Cyber Snake, honors session override", async () => {
    const { program } = fakeProgram();
    const seed = new Uint8Array(32);
    const hash = new Uint8Array(32);
    const ix: any = await buildSubmitScoreIx(program, player, {
      variant: "classic",
      score: new BN(10),
      continuesUsed: 0,
      powerupsUsed: 0,
      sessionSeed: seed,
      durationSec: 5,
      moveHash: hash,
      meta: "",
      vsChallenger: PublicKey.default,
    });
    expect(ix.__ix).toBe("submitScore");
    expect(ix.accounts.game.equals(gamePda(1)[0])).toBe(true); // CYBER_SNAKE_GAME_ID
    expect(ix.accounts.session).toBeNull();
  });

  it("buildSubmitScoreIx: uses explicit gameId + session when provided", async () => {
    const { program } = fakeProgram();
    const session = Keypair.generate().publicKey;
    const ix: any = await buildSubmitScoreIx(program, player, {
      variant: "daily",
      score: new BN(1),
      continuesUsed: 0,
      powerupsUsed: 0,
      sessionSeed: new Uint8Array(32),
      durationSec: 1,
      moveHash: new Uint8Array(32),
      meta: "",
      vsChallenger: PublicKey.default,
      gameId: 4,
      session,
    });
    expect(ix.accounts.game.equals(gamePda(4)[0])).toBe(true);
    expect(ix.accounts.session.equals(session)).toBe(true);
  });

  it("buildRecordPaymentIx: wires all config PDAs, null referrerProfile by default", async () => {
    const { program } = fakeProgram();
    const ix: any = await buildRecordPaymentIx(program, player, {
      category: 2,
      amountMicroUsd: new BN(50_000),
      paymentMint: PublicKey.default,
      paymentAmountRaw: new BN(50_000),
      paymentTxSig: new Uint8Array(64),
      externalRef: "ref",
    });
    expect(ix.__ix).toBe("recordPayment");
    expect(ix.accounts.stablecoinConfig.equals(stablecoinConfigPda()[0])).toBe(true);
    expect(ix.accounts.rates.equals(ratesPda()[0])).toBe(true);
    expect(ix.accounts.affiliateConfig.equals(affiliateConfigPda()[0])).toBe(true);
    expect(ix.accounts.paymentsConfig.equals(paymentsConfigPda()[0])).toBe(true);
    expect(ix.accounts.referrerProfile).toBeNull();
  });

  it("buildRecordPaymentIx: passes referrerProfile + explicit gameId through", async () => {
    const { program } = fakeProgram();
    const ref = Keypair.generate().publicKey;
    const ix: any = await buildRecordPaymentIx(program, player, {
      category: 2,
      amountMicroUsd: new BN(1),
      paymentMint: GAME_MINT,
      paymentAmountRaw: new BN(1),
      paymentTxSig: new Uint8Array(64),
      externalRef: "r",
      referrerProfile: ref,
      gameId: 5,
    });
    expect(ix.accounts.referrerProfile.equals(ref)).toBe(true);
    expect(ix.accounts.game.equals(gamePda(5)[0])).toBe(true);
  });

  it("admin builders resolve their PDAs", async () => {
    const { program } = fakeProgram();
    const dl = new BN(1);
    const rates: any = await buildInitExchangeRatesIx(program, admin, new BN(1), new BN(2));
    expect(rates.__ix).toBe("initializeExchangeRates");
    expect(rates.accounts.rates.equals(ratesPda()[0])).toBe(true);

    const upd: any = await buildUpdateExchangeRatesIx(program, admin, new BN(1), new BN(2), dl);
    expect(upd.__ix).toBe("updateExchangeRates");

    const initAff: any = await buildInitAffiliateConfigIx(program, admin, new BN(100));
    expect(initAff.accounts.affiliateConfig.equals(affiliateConfigPda()[0])).toBe(true);

    const setEn: any = await buildSetAffiliateEnabledIx(program, admin, true, dl);
    expect(setEn.__ix).toBe("setAffiliateEnabled");

    const setMin: any = await buildSetAffiliateMinAccrualIx(program, admin, new BN(1), dl);
    expect(setMin.__ix).toBe("setAffiliateMinAccrual");

    const initSc: any = await buildInitStablecoinsIx(program, admin, [GAME_MINT]);
    // padded to 8 slots; first is provided mint, rest default
    expect(initSc.args[0]).toHaveLength(8);
    expect(initSc.args[0][0].equals(GAME_MINT)).toBe(true);
    expect(initSc.args[0][7].equals(PublicKey.default)).toBe(true);

    const updSc: any = await buildUpdateStablecoinsIx(program, admin, [GAME_MINT], dl);
    expect(updSc.args[0]).toHaveLength(8);
  });

  it("buildCommitReplayIx targets commitSessionReplay", async () => {
    const { program } = fakeProgram();
    const ix: any = await buildCommitReplayIx(program, player, {
      scoreNonce: new BN(1),
      sessionSeed: new Uint8Array(32),
      moveLog: new Uint8Array([1, 2, 3]),
    });
    expect(ix.__ix).toBe("commitSessionReplay");
    expect(ix.accounts.player.equals(player)).toBe(true);
  });

  it("receipt builders (mint/transfer/close) resolve receipt PDA + owner", async () => {
    const { program } = fakeProgram();
    const mint: any = await buildMintReceiptIx(program, player, {
      nonce: new BN(7),
      score: new BN(1),
      continuesUsed: 0,
      powerupsUsed: 0,
      sessionSeed: new Uint8Array(32),
      moveHash: new Uint8Array(32),
      durationSec: 1,
      gpx5rMemoTx: new Uint8Array(64),
    });
    expect(mint.accounts.receipt.equals(receiptPda(player, new BN(7))[0])).toBe(true);

    const receipt = Keypair.generate().publicKey;
    const newOwner = Keypair.generate().publicKey;
    const xfer: any = await buildTransferReceiptIx(program, player, receipt, newOwner);
    expect(xfer.__ix).toBe("transferReplayReceipt");
    expect(xfer.accounts.owner.equals(player)).toBe(true);

    const close: any = await buildCloseReceiptIx(program, player, receipt);
    expect(close.__ix).toBe("closeReplayReceipt");
  });

  it("buildSetHandleIx: null oldHandleClaim on first claim, derived on rename", async () => {
    const { program } = fakeProgram();
    const first: any = await buildSetHandleIx(program, player, "neo", "");
    expect(first.accounts.oldHandleClaim).toBeNull();
    expect(first.accounts.newHandleClaim.equals(handleClaimPda("neo")[0])).toBe(true);

    const rename: any = await buildSetHandleIx(program, player, "trinity", "neo");
    expect(rename.accounts.oldHandleClaim.equals(handleClaimPda("neo")[0])).toBe(true);
  });

  it("buildUpdateBioIx resolves the profileExt PDA", async () => {
    const { program } = fakeProgram();
    const ix: any = await buildUpdateBioIx(program, player, "gm");
    expect(ix.__ix).toBe("updateBio");
    expect(ix.accounts.profileExt.equals(profileExtPda(player)[0])).toBe(true);
  });
});

describe("client: RPC-account helpers (mocked connection/program)", () => {
  it("fetchProfile returns null when the account does not exist", async () => {
    const conn = { getAccountInfo: vi.fn(async () => null) } as any;
    expect(await fetchProfile(conn, player)).toBeNull();
  });

  it("fetchProfile returns the raw account info when present", async () => {
    const info = { lamports: 1, data: new Uint8Array() };
    const conn = { getAccountInfo: vi.fn(async () => info) } as any;
    expect(await fetchProfile(conn, player)).toBe(info);
  });

  it("buildSplTransferIxs creates the dest ATA when missing, else skips it", async () => {
    const from = Keypair.generate().publicKey;
    const to = Keypair.generate().publicKey;

    const connMissing = { getAccountInfo: vi.fn(async () => null) } as any;
    const withCreate = await buildSplTransferIxs(
      connMissing, player, from, to, GAME_MINT, new BN(100), 10,
    );
    expect(withCreate).toHaveLength(2); // create ATA + transfer

    const connExists = { getAccountInfo: vi.fn(async () => ({ lamports: 1 })) } as any;
    const noCreate = await buildSplTransferIxs(
      connExists, player, from, to, GAME_MINT, new BN(100), 10,
    );
    expect(noCreate).toHaveLength(1); // transfer only
  });

  it("buildUsdcTransferIxs delegates to buildSplTransferIxs (6-dec USDC)", async () => {
    const conn = { getAccountInfo: vi.fn(async () => ({ lamports: 1 })) } as any;
    const ixs = await buildUsdcTransferIxs(
      conn, player, player, Keypair.generate().publicKey, new BN(50_000),
    );
    expect(ixs).toHaveLength(1);
  });

  it("getTreasuryWallet reads config.treasuryWallet and caches it", async () => {
    const treasury = Keypair.generate().publicKey;
    const fetchFn = vi.fn(async () => ({ treasuryWallet: treasury }));
    const program = { account: { arcadeConfig: { fetch: fetchFn } } } as any;
    const first = await getTreasuryWallet(program);
    expect(first.equals(treasury)).toBe(true);
    // Second call is served from the in-memory cache (no extra fetch).
    const second = await getTreasuryWallet(program);
    expect(second.equals(treasury)).toBe(true);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("fetchExchangeRates maps + caches the on-chain snapshot for 30s", async () => {
    const snap = {
      solMicroUsdPerLamport: new BN(1),
      gameMicroUsdPerQuark: new BN(2),
      solUpdatedAt: 111,
      gameUpdatedAt: 222,
    };
    const fetchFn = vi.fn(async () => snap);
    const program = { account: { exchangeRatesConfig: { fetch: fetchFn } } } as any;
    const r = await fetchExchangeRates(program);
    expect(r.solUpdatedAt).toBe(111);
    expect(r.gameMicroUsdPerQuark.toNumber()).toBe(2);
    await fetchExchangeRates(program); // cache hit within 30s
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});

describe("client: buildBuyGameAndPayIxs (Flipcash buy + transfer + record bundle)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("assembles buy_tokens + transfer + record_payment, creating the GAME ATA when missing", async () => {
    const treasury = Keypair.generate().publicKey;
    // Program stub: recordPayment builder + treasury/rates fetches.
    const { program } = fakeProgram();
    (program as any).account = {
      arcadeConfig: { fetch: vi.fn(async () => ({ treasuryWallet: treasury })) },
      exchangeRatesConfig: {
        fetch: vi.fn(async () => ({
          solMicroUsdPerLamport: new BN(RATE_SCALE_FACTOR),
          gameMicroUsdPerQuark: new BN(RATE_SCALE_FACTOR),
          solUpdatedAt: 0,
          gameUpdatedAt: 0,
        })),
      },
    };
    // First getAccountInfo call (buyer GAME ATA) -> missing => create ix added.
    // Later calls (transfer dest ATA) -> exists.
    const getAccountInfo = vi
      .fn()
      .mockResolvedValueOnce(null) // GAME ATA missing
      .mockResolvedValue({ lamports: 1 }); // treasury GAME ATA exists
    const conn = { getAccountInfo } as any;

    const ixs = await buildBuyGameAndPayIxs(program, conn, player, {
      category: 2,
      basePriceMicroUsd: new BN(50_000),
      externalRef: "buy",
    });

    // create ATA + buy_tokens + transfer + record_payment = 4
    expect(ixs.length).toBe(4);
    // last ix is the record_payment (sentinel from fakeProgram)
    const last: any = ixs[ixs.length - 1];
    expect(last.__ix).toBe("recordPayment");
    expect(last.accounts.paymentsConfig.equals(paymentsConfigPda()[0])).toBe(true);
  });

  it("skips the GAME ATA creation ix when it already exists", async () => {
    const treasury = Keypair.generate().publicKey;
    const { program } = fakeProgram();
    (program as any).account = {
      arcadeConfig: { fetch: vi.fn(async () => ({ treasuryWallet: treasury })) },
      exchangeRatesConfig: {
        fetch: vi.fn(async () => ({
          solMicroUsdPerLamport: new BN(RATE_SCALE_FACTOR),
          gameMicroUsdPerQuark: new BN(RATE_SCALE_FACTOR),
          solUpdatedAt: 0,
          gameUpdatedAt: 0,
        })),
      },
    };
    const conn = { getAccountInfo: vi.fn(async () => ({ lamports: 1 })) } as any;
    const ixs = await buildBuyGameAndPayIxs(program, conn, player, {
      category: 2,
      basePriceMicroUsd: new BN(50_000),
      externalRef: "buy2",
      usdfBufferBps: 200,
    });
    // buy_tokens + transfer + record_payment = 3 (no ATA-create)
    expect(ixs.length).toBe(3);
  });
});
