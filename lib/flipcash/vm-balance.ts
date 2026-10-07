// Real Flipcash balances, read from the Code VM on-chain.
//
// WHY THIS EXISTS. The Shop showed "◆ 0" to someone holding 841M $GAME, because it
// looked up an SPL associated token account. Flipcash does not keep balances there.
// It runs a VM: every real token sits in ONE omnibus account per mint, and each
// user's balance is a u64 inside a "virtual account" packed into the raw bytes of a
// VM *memory* account. So the only way to read a balance is to parse that memory.
//
// Layout, from code-vm (api/src/cvm/state/memory.rs, api/src/cvm/account/timelock.rs):
//
//   MemoryAccount = 8 discriminator + vm(32) + name(32) + bump(1) + version(1)
//                 + packed_info(6)                                  = 80 bytes
//   then a SliceAllocator: state[capacity] bytes (0 = Free, 1 = Used)
//                          followed by capacity * itemSize raw items
//   each item = 1 variant byte (1 = Timelock) + VirtualTimelockAccount (76 bytes):
//                 owner(32) instance(32) token_bump unlock_bump withdraw_bump
//                 balance:u64 bump
//   so within an item: owner at +1, balance at +68.
//
// Freeing a slot flips the state byte but does NOT zero the payload, so the state
// byte must be honoured or stale owners read as live.
//
// A balance only disappears from memory if the account is COMPRESSED into the merkle
// tree, and the server only compresses at balance 0 (ocp-server fulfillment_handler),
// so a non-zero balance is always readable here.

import { Connection, PublicKey } from "@solana/web3.js";

const VM_PROGRAM = new PublicKey("vmZ1WUq8SxjBWcaeTCvgJRZbS84R61uniFsQy5YMRTJ");

export type MintKey = "game" | "usdf";

const HEADER = 80;
const OWNER_AT = 1;      // within an item
const BALANCE_AT = 68;   // within an item
const VARIANT_TIMELOCK = 1;
const STATE_USED = 1;

// Decimals DIFFER per mint and must never be assumed: USDF is 6dp, $GAME is 10dp.
// Reading both as 6dp reported 841,029,906 $GAME for a balance that is 84,102.99 --
// off by 10,000x. Read it from the mint and cache it; decimals are immutable.
const MINT: Record<MintKey, string> = {
  game: "7TTBUfDomCKBMemv7FF37Tg3y52cRkAxn8vJnvKD4rsE",
  usdf: "5AMAA9JV9H97YYVxx8F6FsCMmTwXSuTTQneiup4RYAUQ",
};
const decimalsCache = new Map<MintKey, number>();

async function decimalsOf(c: Connection, mint: MintKey): Promise<number> {
  const hit = decimalsCache.get(mint);
  if (hit != null) return hit;
  const info = await c.getParsedAccountInfo(new PublicKey(MINT[mint]));
  const parsed = info.value?.data;
  const d =
    parsed && typeof parsed === "object" && "parsed" in parsed
      ? (parsed.parsed as { info?: { decimals?: number } })?.info?.decimals
      : undefined;
  if (typeof d !== "number") throw new Error(`could not read decimals for ${mint}`);
  decimalsCache.set(mint, d);
  return d;
}

// VMs are per mint and fixed. USDF's is hardcoded in ocp-server config.go; $GAME's
// was found by scanning CodeVmAccount.mint and is stable for the life of the mint.
const VM: Record<MintKey, string> = {
  game: "4E6Q8SehfXX6N5KcztrAL92LJucNakbvb3K2Q91DDfZF",
  usdf: "JACkaKsm2Rd6TNJwH4UB7G6tHrWUATJPTgNNnRVsg4ip",
};

function rpc(): Connection {
  const url =
    process.env.SOLANA_RPC ||
    process.env.NEXT_PUBLIC_SOLANA_RPC ||
    "https://api.mainnet-beta.solana.com";
  return new Connection(url, "confirmed");
}

// Which memory accounts belong to a VM. Discovered rather than hardcoded: Flipcash
// adds banks ("timelock-1", "timelock-2", …) as it fills them, and a hardcoded list
// would silently stop finding people who land in a new one.
const banksCache = new Map<MintKey, { banks: string[]; expiresAt: number }>();
const BANKS_TTL_MS = 10 * 60_000;

async function timelockBanks(c: Connection, mint: MintKey): Promise<string[]> {
  const hit = banksCache.get(mint);
  if (hit && hit.expiresAt > Date.now()) return hit.banks;

  const accounts = await c.getProgramAccounts(VM_PROGRAM, {
    // Headers only. These accounts are tens to hundreds of KB each.
    dataSlice: { offset: 0, length: HEADER },
    filters: [{ memcmp: { offset: 8, bytes: VM[mint] } }],
  });
  const banks = accounts
    .filter((a) => {
      const name = a.account.data.subarray(40, 72).toString("utf8").replace(/\0/g, "");
      return name.startsWith("timelock-"); // nonce banks hold no balances
    })
    .map((a) => a.pubkey.toBase58());

  banksCache.set(mint, { banks, expiresAt: Date.now() + BANKS_TTL_MS });
  return banks;
}

// Where an owner sits, so later reads fetch 77 bytes instead of a megabyte. The slot
// is stable while the account lives; the owner is re-checked on every fast read, and
// a mismatch falls back to a full scan rather than returning someone else's money.
const slotCache = new Map<string, { bank: string; index: number; itemsOff: number; itemSize: number }>();

function readItem(data: Buffer, off: number): { owner: string; balance: bigint } | null {
  if (data[off] !== VARIANT_TIMELOCK) return null;
  return {
    owner: new PublicKey(data.subarray(off + OWNER_AT, off + OWNER_AT + 32)).toBase58(),
    balance: data.readBigUInt64LE(off + BALANCE_AT),
  };
}

async function scan(c: Connection, bank: string, owner: string) {
  const ai = await c.getAccountInfo(new PublicKey(bank));
  if (!ai) return null;
  const d = ai.data;
  const itemSize = d.readUInt16LE(74);
  const capacity = d.readUInt16LE(76);
  const itemsOff = HEADER + capacity;
  for (let i = 0; i < capacity; i++) {
    if (d[HEADER + i] !== STATE_USED) continue; // honour the state byte: freed slots keep stale bytes
    const item = readItem(d, itemsOff + i * itemSize);
    if (item && item.owner === owner) {
      return { balance: item.balance, index: i, itemsOff, itemSize };
    }
  }
  return null;
}

/**
 * Raw quarks held by `owner` for one mint, or null when they have no virtual account
 * for it. null means UNKNOWN, not zero — never render it as a balance.
 */
export async function getVmBalance(owner: string, mint: MintKey): Promise<bigint | null> {
  let ownerKey: PublicKey;
  try {
    ownerKey = new PublicKey(owner);
  } catch {
    return null;
  }
  const c = rpc();
  const cacheKey = `${mint}:${ownerKey.toBase58()}`;

  const known = slotCache.get(cacheKey);
  if (known) {
    const off = known.itemsOff + known.index * known.itemSize;
    const ai = await c.getAccountInfo(new PublicKey(known.bank), {
      dataSlice: { offset: off, length: known.itemSize },
    });
    const item = ai && readItem(ai.data, 0);
    // Slots are reused when an account closes, so a stale index can point at someone
    // else. Only trust it while the owner still matches.
    if (item && item.owner === ownerKey.toBase58()) return item.balance;
    slotCache.delete(cacheKey);
  }

  for (const bank of await timelockBanks(c, mint)) {
    const found = await scan(c, bank, ownerKey.toBase58());
    if (found) {
      slotCache.set(cacheKey, { bank, index: found.index, itemsOff: found.itemsOff, itemSize: found.itemSize });
      return found.balance;
    }
  }
  return null;
}

/** Quarks to whole units, using the mint's OWN decimals. */
export async function toUnits(quarks: bigint | null, mint: MintKey): Promise<number | null> {
  if (quarks == null) return null;
  const d = await decimalsOf(rpc(), mint);
  return Number(quarks) / 10 ** d;
}

/** Both balances for one owner. Either may be null, meaning "no account", not zero. */
export async function getFlipcashBalances(owner: string): Promise<{ game: number | null; usdf: number | null }> {
  const [game, usdf] = await Promise.all([
    getVmBalance(owner, "game").then((q) => toUnits(q, "game")).catch(() => null),
    getVmBalance(owner, "usdf").then((q) => toUnits(q, "usdf")).catch(() => null),
  ]);
  return { game, usdf };
}
