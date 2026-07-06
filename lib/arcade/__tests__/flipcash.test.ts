import { describe, it, expect } from "vitest";
import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { Keypair } from "@solana/web3.js";
import {
  FLIPCASH_PROGRAM_ID,
  FLIPCASH_GAME_MINT,
  USDF_MINT,
  flipcashCurrencyPda,
  flipcashPoolPda,
  flipcashVaultPda,
  flipcashGamePdas,
  buildFlipcashBuyTokensIx,
} from "../flipcash";

describe("flipcash: PDA derivation (matches on-chain seeds)", () => {
  it("currency PDA uses ['currency', mint]", () => {
    const [pda, bump] = flipcashCurrencyPda(FLIPCASH_GAME_MINT);
    const [expected] = PublicKey.findProgramAddressSync(
      [Buffer.from("currency"), FLIPCASH_GAME_MINT.toBuffer()],
      FLIPCASH_PROGRAM_ID,
    );
    expect(pda.equals(expected)).toBe(true);
    expect(bump).toBeGreaterThanOrEqual(0);
    expect(bump).toBeLessThanOrEqual(255);
  });

  it("pool PDA uses ['pool', currency]", () => {
    const [currency] = flipcashCurrencyPda(FLIPCASH_GAME_MINT);
    const [pool] = flipcashPoolPda(currency);
    const [expected] = PublicKey.findProgramAddressSync(
      [Buffer.from("pool"), currency.toBuffer()],
      FLIPCASH_PROGRAM_ID,
    );
    expect(pool.equals(expected)).toBe(true);
  });

  it("vault PDA uses ['treasury', pool, mint]", () => {
    const [currency] = flipcashCurrencyPda(FLIPCASH_GAME_MINT);
    const [pool] = flipcashPoolPda(currency);
    const [vault] = flipcashVaultPda(pool, FLIPCASH_GAME_MINT);
    const [expected] = PublicKey.findProgramAddressSync(
      [Buffer.from("treasury"), pool.toBuffer(), FLIPCASH_GAME_MINT.toBuffer()],
      FLIPCASH_PROGRAM_ID,
    );
    expect(vault.equals(expected)).toBe(true);
  });

  it("derivation is deterministic", () => {
    expect(flipcashCurrencyPda(FLIPCASH_GAME_MINT)[0].toBase58()).toBe(
      flipcashCurrencyPda(FLIPCASH_GAME_MINT)[0].toBase58(),
    );
  });
});

describe("flipcash: flipcashGamePdas bundle", () => {
  it("wires currency/pool/currencyVault/baseVault consistently with the helpers", () => {
    const { currency, pool, currencyVault, baseVault } = flipcashGamePdas();

    expect(currency.equals(flipcashCurrencyPda(FLIPCASH_GAME_MINT)[0])).toBe(true);
    expect(pool.equals(flipcashPoolPda(currency)[0])).toBe(true);
    // currency vault holds $GAME; base vault holds USDF — different mints, different vaults.
    expect(currencyVault.equals(flipcashVaultPda(pool, FLIPCASH_GAME_MINT)[0])).toBe(true);
    expect(baseVault.equals(flipcashVaultPda(pool, USDF_MINT)[0])).toBe(true);
    expect(currencyVault.equals(baseVault)).toBe(false);
  });
});

describe("flipcash: buildFlipcashBuyTokensIx (pure instruction encoding)", () => {
  const buyer = Keypair.generate().publicKey;
  const buyerGameAta = Keypair.generate().publicKey;
  const buyerUsdfAta = Keypair.generate().publicKey;

  it("targets the Flipcash program and encodes disc + two u64 LE args", () => {
    const ix = buildFlipcashBuyTokensIx(buyer, buyerGameAta, buyerUsdfAta, new BN(1000), new BN(900));
    expect(ix.programId.equals(FLIPCASH_PROGRAM_ID)).toBe(true);
    // 1-byte discriminator + 8 + 8 = 17 bytes
    expect(ix.data.length).toBe(17);
    expect(ix.data.readBigUInt64LE(1)).toBe(BigInt(1000)); // in_amount
    expect(ix.data.readBigUInt64LE(9)).toBe(BigInt(900)); // min_amount_out
  });

  it("places buyer as the sole signer and marks vaults/ATAs writable", () => {
    const ix = buildFlipcashBuyTokensIx(buyer, buyerGameAta, buyerUsdfAta, new BN(1), new BN(1));
    const signers = ix.keys.filter((k) => k.isSigner);
    expect(signers).toHaveLength(1);
    expect(signers[0].pubkey.equals(buyer)).toBe(true);
    // buyer's ATAs are debited/credited -> writable
    const gameAta = ix.keys.find((k) => k.pubkey.equals(buyerGameAta))!;
    const usdfAta = ix.keys.find((k) => k.pubkey.equals(buyerUsdfAta))!;
    expect(gameAta.isWritable).toBe(true);
    expect(usdfAta.isWritable).toBe(true);
  });
});
