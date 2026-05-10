// Shared CM v2.1 wagered-battle client used by all 3 BattleMode UIs.
// One module powers cyber-snake / magic-chess / blockwords. New game = config entry.

import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import type { WalletContextState } from "@solana/wallet-adapter-react";

const RESOLVER_URL =
  process.env.NEXT_PUBLIC_RESOLVER_URL || "https://resolver.gamerplex.com";

export const CM_PROGRAM_ID = new PublicKey(
  "69YfcveAbLbJ5LNERjq6k5wnszfZbXMYVzx2j8Ca1Xo8",
);
export const USDF_MINT = new PublicKey(
  "9Lc5ftsVbVS1T8c6D9Yan83fNaPryo3xpKp4DgKtyKhK",
);
const POOL_SPONSOR = new PublicKey(
  "FNKPP6q2qk3wqMd7ErkWYk98etrZfuMnvGh2EQKdrrcJ",
);
const POOL_SPONSOR_USDF_ATA = new PublicKey(
  "4QPM19nGc9HeBXKk6yKBxML9hpdDEBPWpNzrWAdadH7P",
);
// Resolver-side admin partner (GYYW…) is stored in Cloud Run secret manager;
// frontend just needs to know its public key for partner_registry derivation
// + its USDF ATA as the protocol/partner treasury sink.
const ADMIN_PARTNER = new PublicKey(
  "GYYWjixJTG5qWULosmbafe16RQff5g3c4XZ1iWwBPpUL",
);
const ADMIN_PARTNER_USDF_ATA = getAssociatedTokenAddressSync(
  USDF_MINT,
  ADMIN_PARTNER,
  false,
);

export type BattleSlug = "cyber-snake" | "magic-chess" | "blockwords";

const GAME_PROGRAM_BY_SLUG: Record<BattleSlug, PublicKey> = {
  "cyber-snake": new PublicKey("EK8gFE1ojW61QuLTvy6dHyLxCq5yjCnauJz8eisNPTk3"),
  "magic-chess": new PublicKey("3LVg8uUsHtq6fusjrSfyGUCLQ83TFegDKmY3bCNz3QYr"),
  "blockwords":  new PublicKey("3XA1rz4f83FoTyvB7g1XHhsb4bx9SrUSBDtpLtAttU4o"),
};

// Anchor ix discriminators (sha256("global:<ix>")[..8]) — pinned, not loaded from IDL.
const D_DEPOSIT = Buffer.from([242, 35, 198, 137, 82, 225, 242, 182]);
const D_RESOLVE_FROM_GAME_PDA = Buffer.from([91, 139, 143, 212, 176, 22, 75, 74]);

function u64Le(v: bigint): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(v, 0);
  return b;
}

export function marketPdaFromEventId(eventId: bigint): PublicKey {
  const idLe = Buffer.alloc(8);
  idLe.writeBigUInt64LE(eventId, 0);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("market"), idLe],
    CM_PROGRAM_ID,
  )[0];
}

function marketVaultPda(market: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), market.toBuffer()],
    CM_PROGRAM_ID,
  )[0];
}

// MarketState p1_deposit / p2_deposit byte offsets (after disc + authority + mint + p1 + p2 + event_id).
const P1_DEPOSIT_OFFSET = 8 + 32 + 32 + 32 + 32 + 8;
const P2_DEPOSIT_OFFSET = P1_DEPOSIT_OFFSET + 8;
const RESOLVED_OFFSET = P2_DEPOSIT_OFFSET + 8;

export interface MarketSnapshot {
  exists: boolean;
  p1Deposit: bigint;
  p2Deposit: bigint;
  resolved: boolean;
}

export async function readMarketSnapshot(
  conn: Connection,
  market: PublicKey,
): Promise<MarketSnapshot> {
  const info = await conn.getAccountInfo(market, "confirmed");
  if (!info || info.data.length < RESOLVED_OFFSET + 1) {
    return { exists: false, p1Deposit: BigInt(0), p2Deposit: BigInt(0), resolved: false };
  }
  const data = info.data;
  return {
    exists: true,
    p1Deposit: data.readBigUInt64LE(P1_DEPOSIT_OFFSET),
    p2Deposit: data.readBigUInt64LE(P2_DEPOSIT_OFFSET),
    resolved: data.readUInt8(RESOLVED_OFFSET) === 1,
  };
}
function marketBindingPda(market: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("market_binding"), market.toBuffer()],
    CM_PROGRAM_ID,
  )[0];
}
function gameRegistryV2Pda(gameProgramId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("game_program_registry_v2"), gameProgramId.toBuffer()],
    CM_PROGRAM_ID,
  )[0];
}
function partnerRegistryPda(authority: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("partner_registry"), authority.toBuffer()],
    CM_PROGRAM_ID,
  )[0];
}
function protocolConfigPda(): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("protocol_config")],
    CM_PROGRAM_ID,
  )[0];
}
function protocolConfigV2Pda(): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("protocol_config_v2")],
    CM_PROGRAM_ID,
  )[0];
}

export interface CreateMarketResult {
  market: PublicKey;
  vault: PublicKey;
  binding: PublicKey;
  sig: string;
}

export async function createWageredMarket(args: {
  gameSlug: BattleSlug;
  p1: PublicKey;
  p2: PublicKey;
  gameStatePda: PublicKey;
  eventId?: bigint;
  expiresAt?: number;
}): Promise<CreateMarketResult> {
  const eventId = (args.eventId ?? BigInt(Date.now())).toString();
  const res = await fetch(`${RESOLVER_URL}/battle/create-market`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      gameSlug: args.gameSlug,
      p1: args.p1.toBase58(),
      p2: args.p2.toBase58(),
      gameStatePda: args.gameStatePda.toBase58(),
      eventId,
      expiresAt: args.expiresAt ?? Math.floor(Date.now() / 1000) + 3600,
    }),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || `resolver returned ${res.status}`);
  return {
    market: new PublicKey(json.market),
    vault: new PublicKey(json.vault),
    binding: new PublicKey(json.binding),
    sig: json.sig,
  };
}

async function signAndSend(
  conn: Connection,
  wallet: WalletContextState,
  ix: TransactionInstruction,
): Promise<string> {
  if (!wallet.publicKey || !wallet.signTransaction) {
    throw new Error("Wallet not connected");
  }
  const { blockhash, lastValidBlockHeight } =
    await conn.getLatestBlockhash("confirmed");
  const tx = new Transaction().add(ix);
  tx.feePayer = wallet.publicKey;
  tx.recentBlockhash = blockhash;
  const signed = await wallet.signTransaction(tx);
  const sig = await conn.sendRawTransaction(signed.serialize(), {
    skipPreflight: false,
  });
  await conn.confirmTransaction(
    { signature: sig, blockhash, lastValidBlockHeight },
    "confirmed",
  );
  return sig;
}

export function userUsdfAta(owner: PublicKey): PublicKey {
  return getAssociatedTokenAddressSync(USDF_MINT, owner, false);
}

export async function depositToMarket(args: {
  conn: Connection;
  wallet: WalletContextState;
  market: PublicKey;
  amount: bigint;
}): Promise<string> {
  if (!args.wallet.publicKey) throw new Error("Wallet not connected");
  const data = Buffer.alloc(8 + 8);
  D_DEPOSIT.copy(data, 0);
  u64Le(args.amount).copy(data, 8);

  const ix = new TransactionInstruction({
    programId: CM_PROGRAM_ID,
    keys: [
      { pubkey: args.market, isSigner: false, isWritable: true },
      { pubkey: marketVaultPda(args.market), isSigner: false, isWritable: true },
      { pubkey: userUsdfAta(args.wallet.publicKey), isSigner: false, isWritable: true },
      { pubkey: args.wallet.publicKey, isSigner: true, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data,
  });
  return signAndSend(args.conn, args.wallet, ix);
}

export async function resolveWageredMarket(args: {
  conn: Connection;
  wallet: WalletContextState;
  market: PublicKey;
  gameSlug: BattleSlug;
  gameStatePda: PublicKey;
  p1: PublicKey;
  p2: PublicKey;
}): Promise<string> {
  if (!args.wallet.publicKey) throw new Error("Wallet not connected");
  const data = Buffer.alloc(8);
  D_RESOLVE_FROM_GAME_PDA.copy(data, 0);

  const gameProgramId = GAME_PROGRAM_BY_SLUG[args.gameSlug];

  const ix = new TransactionInstruction({
    programId: CM_PROGRAM_ID,
    keys: [
      { pubkey: args.market, isSigner: false, isWritable: true },
      { pubkey: partnerRegistryPda(ADMIN_PARTNER), isSigner: false, isWritable: false },
      { pubkey: protocolConfigPda(), isSigner: false, isWritable: false },
      { pubkey: protocolConfigV2Pda(), isSigner: false, isWritable: false },
      { pubkey: gameRegistryV2Pda(gameProgramId), isSigner: false, isWritable: false },
      { pubkey: marketBindingPda(args.market), isSigner: false, isWritable: false },
      { pubkey: args.gameStatePda, isSigner: false, isWritable: false },
      { pubkey: marketVaultPda(args.market), isSigner: false, isWritable: true },
      { pubkey: userUsdfAta(args.p1), isSigner: false, isWritable: true },
      { pubkey: userUsdfAta(args.p2), isSigner: false, isWritable: true },
      { pubkey: ADMIN_PARTNER_USDF_ATA, isSigner: false, isWritable: true },
      { pubkey: ADMIN_PARTNER_USDF_ATA, isSigner: false, isWritable: true },
      { pubkey: POOL_SPONSOR, isSigner: false, isWritable: false },
      { pubkey: POOL_SPONSOR_USDF_ATA, isSigner: false, isWritable: true },
      { pubkey: args.wallet.publicKey, isSigner: true, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data,
  });
  return signAndSend(args.conn, args.wallet, ix);
}

export const STAKES = [0.5, 1, 5, 10] as const;
export type Stake = typeof STAKES[number];
export const USDF_DECIMALS = 6;
export function stakeToRaw(stake: Stake): bigint {
  return BigInt(Math.round(stake * 10 ** USDF_DECIMALS));
}
