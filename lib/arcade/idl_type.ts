/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/gamerplex_arcade.json`.
 */
export type GamerplexArcade = {
  "address": "4FVwdxxBp6PTax2tAcPyHE9rYt8tyNf2YBGrSnSqmx8t",
  "metadata": {
    "name": "gamerplexArcade",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Gamerplex Arcade — first-party solo micro-games with on-chain scores, payments, and leaderboards"
  },
  "instructions": [
    {
      "name": "closeReplayReceipt",
      "docs": [
        "Close ReplayReceipt and refund rent to the current owner. Only owner",
        "can call. If wrapped as cNFT, block close — the cNFT must be burned",
        "/ unwrapped first (kept as invariant for v1.3 integration)."
      ],
      "discriminator": [
        43,
        34,
        80,
        151,
        103,
        80,
        205,
        45
      ],
      "accounts": [
        {
          "name": "receipt",
          "docs": [
            "Receipt to close — rent refunded to owner's wallet. Close requires owner sig.",
            "If wrapped as cNFT, the instruction body blocks close until unwrapped."
          ],
          "writable": true
        },
        {
          "name": "owner",
          "docs": [
            "Current owner (signs + receives refunded rent)."
          ],
          "writable": true,
          "signer": true,
          "relations": [
            "receipt"
          ]
        }
      ],
      "args": []
    },
    {
      "name": "commitSessionReplay",
      "docs": [
        "Commit a full deterministic move log on-chain so anyone can replay the",
        "session and cryptographically verify the submitted score. Emits a",
        "GPX5R memo carrying the base64-encoded log. Triggers the 🏆 VERIFIED",
        "leaderboard badge.",
        "",
        "Pricing: player has already paid via a preceding `record_payment` with",
        "category=CATEGORY_VERIFIED_COMMIT and amount=VERIFIED_COMMIT_MICRO_USD",
        "($0.10) in the same tx. We trust the frontend to bundle them; if the",
        "payment tx doesn't land the resolver flags the score + removes the",
        "VERIFIED badge. Economic deterrent is the $0.10 fee already paid.",
        "",
        "Size limit: 400 bytes of binary move-data (~540 chars base64). Games",
        "whose sessions routinely exceed this can instead use the",
        "`external_ref` field on record_payment pointing at an off-chain store",
        "(Arweave recommended)."
      ],
      "discriminator": [
        168,
        26,
        124,
        178,
        123,
        33,
        18,
        125
      ],
      "accounts": [
        {
          "name": "player",
          "signer": true
        },
        {
          "name": "memoProgram",
          "address": "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"
        },
        {
          "name": "instructionsSysvar",
          "docs": [
            "record_payment(VERIFIED_COMMIT)."
          ],
          "address": "Sysvar1nstructions1111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "scoreNonce",
          "type": "u64"
        },
        {
          "name": "sessionSeed",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "moveLog",
          "type": "bytes"
        }
      ]
    },
    {
      "name": "initializeConfig",
      "docs": [
        "One-time initialization of the arcade. Only callable once per program",
        "(seeds = [\"config\"] PDA, `init` fails if already open)."
      ],
      "discriminator": [
        208,
        127,
        21,
        1,
        194,
        190,
        196,
        70
      ],
      "accounts": [
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "treasuryWallet",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "initializeStablecoins",
      "docs": [
        "One-time init of the StablecoinConfig PDA. Admin passes the initial",
        "allowlist of accepted stablecoin mints. Up to MAX_STABLECOIN_SLOTS = 8",
        "slots; unused slots set to `Pubkey::default()`.",
        "",
        "Typical bootstrap:",
        "Devnet:  [USDC_DEVNET,  default, default, ...]",
        "Mainnet: [USDC_MAINNET, default, default, ...]",
        "Additional stablecoins added later via update_accepted_stablecoins."
      ],
      "discriminator": [
        219,
        26,
        189,
        116,
        146,
        30,
        54,
        54
      ],
      "accounts": [
        {
          "name": "config",
          "docs": [
            "Admin must match ArcadeConfig.admin. has_one enforces this."
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "stablecoinConfig",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  98,
                  108,
                  101,
                  99,
                  111,
                  105,
                  110,
                  115
                ]
              }
            ]
          }
        },
        {
          "name": "admin",
          "writable": true,
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "mints",
          "type": {
            "array": [
              "pubkey",
              8
            ]
          }
        }
      ]
    },
    {
      "name": "mintReplayReceipt",
      "docs": [
        "Mint a ReplayReceipt PDA for a completed run. Requires the player to",
        "have paid CATEGORY_REPLAY_RECEIPT ($0.25) via record_payment in the",
        "same tx. Stamps the run data immutably (original_player = signer,",
        "owner = signer initially — these CAN diverge later via transfer).",
        "",
        "The PDA is seeded by (player, nonce) so each receipt is unique. Client",
        "passes the nonce (typically the submit-score timestamp) to make",
        "receipts addressable."
      ],
      "discriminator": [
        15,
        161,
        240,
        123,
        212,
        186,
        112,
        53
      ],
      "accounts": [
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "game"
        },
        {
          "name": "receipt",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  99,
                  101,
                  105,
                  112,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "player"
              },
              {
                "kind": "arg",
                "path": "nonce"
              }
            ]
          }
        },
        {
          "name": "player",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "instructionsSysvar",
          "docs": [
            "record_payment(REPLAY_RECEIPT)."
          ],
          "address": "Sysvar1nstructions1111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "nonce",
          "type": "u64"
        },
        {
          "name": "score",
          "type": "u64"
        },
        {
          "name": "continuesUsed",
          "type": "u8"
        },
        {
          "name": "powerupsUsed",
          "type": "u8"
        },
        {
          "name": "sessionSeed",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "moveHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "durationSec",
          "type": "u32"
        },
        {
          "name": "gpx5rMemoTx",
          "type": {
            "array": [
              "u8",
              64
            ]
          }
        }
      ]
    },
    {
      "name": "openPlayerProfile",
      "docs": [
        "Open a PlayerProfile PDA for a wallet. Called once per wallet, by the",
        "wallet itself (anyone pays their own rent). Idempotent via `init`.",
        "",
        "If the caller arrived via a challenge link and wants to attribute their",
        "referral, they pass `referrer = Some(<challenger_pubkey>)`. The",
        "challenger MUST have an already-open PlayerProfile (passed in the",
        "accounts as `referrer_profile`) — this blocks attribution to arbitrary",
        "wallets and guarantees the referrer is a real Gamerplex participant.",
        "Self-referral is rejected. The referrer becomes IMMUTABLE after this",
        "call — first-refer-wins, no switcheroos."
      ],
      "discriminator": [
        77,
        227,
        233,
        84,
        220,
        213,
        187,
        232
      ],
      "accounts": [
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "profile",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  102,
                  105,
                  108,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "player"
              }
            ]
          }
        },
        {
          "name": "referrerProfile",
          "docs": [
            "Optional: if a referrer is passed in the instruction, the referrer's",
            "already-open PlayerProfile must be provided here. The PDA seeds",
            "constraint + `wallet` field check in the instruction guarantees the",
            "referrer actually exists on Gamerplex — blocks arbitrary-wallet spoof.",
            "When no referrer is passed, this account is ignored (None)."
          ],
          "optional": true
        },
        {
          "name": "player",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "referrer",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "recordPayment",
      "docs": [
        "Record a payment made via Solana Pay / Flipcash, tied to a specific",
        "game action. Gives the player an auditable trail of what they paid for,",
        "and accrues affiliate earnings to the referrer if the tail is active.",
        "",
        "This does NOT execute the underlying payment — the USDC/$GAMER transfer",
        "already happened (player signed a Solana Pay tx before / atomically",
        "with this call). `record_payment` commits the tx sig + category +",
        "amount on-chain for audit and drives affiliate accrual.",
        "",
        "Amount bounds (defense against inflation / dust attacks):",
        "MIN_PAYMENT_MICRO_USD  = $0.01   — blocks dust-spam farming",
        "MAX_PAYMENT_MICRO_USD  = $100.00 — blocks inflated-claim attacks",
        "",
        "Affiliate payout logic:",
        "- Only runs if profile.referrer is set and the tail window is open",
        "(now < referrer_expires_at AND referrer_payments_remaining > 0)",
        "- Computes 20% cut (AFFILIATE_CUT_BPS = 2000 basis points)",
        "- Accrues to referrer_profile.affiliate_earned_accrued_micro",
        "- Decrements referrer_payments_remaining",
        "- Emits AffiliateAccrued event for off-chain indexers",
        "",
        "The referrer's PlayerProfile PDA must be passed if profile.referrer is",
        "set. If profile has no referrer, referrer_profile is ignored (None)."
      ],
      "discriminator": [
        226,
        154,
        10,
        27,
        9,
        14,
        148,
        137
      ],
      "accounts": [
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "stablecoinConfig",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  98,
                  108,
                  101,
                  99,
                  111,
                  105,
                  110,
                  115
                ]
              }
            ]
          }
        },
        {
          "name": "game"
        },
        {
          "name": "profile",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  102,
                  105,
                  108,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "player"
              }
            ]
          }
        },
        {
          "name": "wallet",
          "relations": [
            "profile"
          ]
        },
        {
          "name": "referrerProfile",
          "docs": [
            "Referrer's PlayerProfile — required if profile.referrer is set and",
            "the tail window is active. Seeds constrain it to the expected wallet",
            "(no mismatched profile can be passed). Optional because many players",
            "have no referrer and the instruction skips affiliate logic in that",
            "case."
          ],
          "writable": true,
          "optional": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  102,
                  105,
                  108,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "profile.referrer",
                "account": "playerProfile"
              }
            ]
          }
        },
        {
          "name": "player",
          "signer": true
        },
        {
          "name": "instructionsSysvar",
          "docs": [
            "SPL TransferChecked. Address-constrained to the canonical sysvar id."
          ],
          "address": "Sysvar1nstructions1111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "category",
          "type": "u8"
        },
        {
          "name": "amountMicroUsd",
          "type": "u64"
        },
        {
          "name": "paymentTxSig",
          "type": {
            "array": [
              "u8",
              64
            ]
          }
        },
        {
          "name": "gamerPaid",
          "type": "bool"
        },
        {
          "name": "externalRef",
          "type": "string"
        }
      ]
    },
    {
      "name": "registerGame",
      "docs": [
        "Register a new arcade game. Admin-only. Each game_id is permanent.",
        "First call after initialize_config should register Cyber Snake",
        "(game_id = 1, slug = \"cyber-snake\")."
      ],
      "discriminator": [
        122,
        44,
        95,
        58,
        89,
        33,
        40,
        59
      ],
      "accounts": [
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "game",
          "writable": true
        },
        {
          "name": "admin",
          "writable": true,
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "gameId",
          "type": "u8"
        },
        {
          "name": "slug",
          "type": "string"
        },
        {
          "name": "displayName",
          "type": "string"
        },
        {
          "name": "deadline",
          "type": "i64"
        }
      ]
    },
    {
      "name": "rotateSeason",
      "discriminator": [
        19,
        15,
        9,
        0,
        130,
        143,
        153,
        72
      ],
      "accounts": [
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "config"
          ]
        }
      ],
      "args": [
        {
          "name": "deadline",
          "type": "i64"
        }
      ]
    },
    {
      "name": "setHandle",
      "docs": [
        "Claim or rename a handle. First call also creates the caller's",
        "ProfileExtV2 PDA (init_if_needed). Atomic close-old + init-new claim.",
        "",
        "Caller responsibilities:",
        "* Pass `old_handle_claim = null` on first claim.",
        "* Pass the existing HandleClaim PDA on rename.",
        "* Handle must match `[a-z0-9_]{3,32}` and not be in RESERVED_HANDLES."
      ],
      "discriminator": [
        206,
        110,
        19,
        48,
        91,
        71,
        188,
        197
      ],
      "accounts": [
        {
          "name": "profileExt",
          "docs": [
            "Created on first call (init_if_needed); mutated on rename.",
            "Seeds bind it to the signer's wallet — no other wallet can ever write here."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  102,
                  105,
                  108,
                  101,
                  45,
                  101,
                  120,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "player"
              }
            ]
          }
        },
        {
          "name": "oldHandleClaim",
          "docs": [
            "Existing claim for the wallet's current handle. REQUIRED if",
            "`profile_ext.handle != \"\"` (rename). Pass `null` on the first claim.",
            "Closed at end of ix → rent refunded to player."
          ],
          "writable": true,
          "optional": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  104,
                  97,
                  110,
                  100,
                  108,
                  101,
                  45,
                  99,
                  108,
                  97,
                  105,
                  109
                ]
              },
              {
                "kind": "account",
                "path": "profile_ext.handle",
                "account": "profileExtV2"
              }
            ]
          }
        },
        {
          "name": "newHandleClaim",
          "docs": [
            "New claim being created. Init constraint enforces global uniqueness —",
            "if anyone else already owns this handle, init fails with account-exists."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  104,
                  97,
                  110,
                  100,
                  108,
                  101,
                  45,
                  99,
                  108,
                  97,
                  105,
                  109
                ]
              },
              {
                "kind": "arg",
                "path": "handle"
              }
            ]
          }
        },
        {
          "name": "player",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "handle",
          "type": "string"
        }
      ]
    },
    {
      "name": "submitScore",
      "docs": [
        "Submit a completed session score. Emits a GPX5 v2 memo via CPI to the",
        "SPL Memo program. Indexers scan memos to build leaderboards — no",
        "on-chain leaderboard PDA in v1.",
        "",
        "Memo format:",
        "GPX5|<game_slug>|<variant>|<player>|<score>|<continues>|<powerups>|<seed_b58>|<duration>|<move_hash_b58>[|<meta>]",
        "",
        "Fairness rule: `continues` and `powerups` must be visibly surfaced on",
        "any leaderboard UI. The arcade-precedent guardrail (1980s 1CC culture)",
        "is that no-continue runs are the \"pure\" board."
      ],
      "discriminator": [
        212,
        128,
        45,
        22,
        112,
        82,
        85,
        235
      ],
      "accounts": [
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "game",
          "writable": true
        },
        {
          "name": "profile",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  102,
                  105,
                  108,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "player"
              }
            ]
          }
        },
        {
          "name": "wallet",
          "relations": [
            "profile"
          ]
        },
        {
          "name": "player",
          "signer": true
        },
        {
          "name": "memoProgram",
          "address": "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"
        }
      ],
      "args": [
        {
          "name": "variant",
          "type": "string"
        },
        {
          "name": "score",
          "type": "u64"
        },
        {
          "name": "continuesUsed",
          "type": "u8"
        },
        {
          "name": "powerupsUsed",
          "type": "u8"
        },
        {
          "name": "sessionSeed",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "durationSec",
          "type": "u32"
        },
        {
          "name": "moveHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "meta",
          "type": "string"
        },
        {
          "name": "vsChallenger",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "transferReplayReceipt",
      "docs": [
        "Transfer ReplayReceipt ownership. Only the current owner can call.",
        "`original_player` is IMMUTABLE — never touched here. The transfer",
        "only moves the tradeable right, never the creator attribution."
      ],
      "discriminator": [
        176,
        21,
        10,
        129,
        118,
        108,
        20,
        121
      ],
      "accounts": [
        {
          "name": "receipt",
          "docs": [
            "Receipt to transfer — Anchor validates program-ownership + discriminator",
            "via the account type. has_one enforces receipt.owner == signer."
          ],
          "writable": true
        },
        {
          "name": "owner",
          "signer": true,
          "relations": [
            "receipt"
          ]
        }
      ],
      "args": [
        {
          "name": "newOwner",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "updateAcceptedStablecoins",
      "docs": [
        "Update the accepted stablecoin allowlist. Admin-only, deadline-gated.",
        "Overwrite semantics — pass the full desired array each time."
      ],
      "discriminator": [
        236,
        126,
        175,
        109,
        156,
        226,
        14,
        60
      ],
      "accounts": [
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "stablecoinConfig",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  98,
                  108,
                  101,
                  99,
                  111,
                  105,
                  110,
                  115
                ]
              }
            ]
          }
        },
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "config"
          ]
        }
      ],
      "args": [
        {
          "name": "mints",
          "type": {
            "array": [
              "pubkey",
              8
            ]
          }
        },
        {
          "name": "deadline",
          "type": "i64"
        }
      ]
    },
    {
      "name": "updateAvatar",
      "docs": [
        "Update avatar source preference. Fully off-chain-resolvable:",
        "0 = fallback color tile (client-generated from wallet hash)",
        "1 = SNS picture record (resolver does reverse-lookup)",
        "2 = NFT PFP (nft_pfp_mint used)",
        "3 = Gamerplex cosmetic (cosmetic_avatar_id used; must be owned)"
      ],
      "discriminator": [
        244,
        92,
        83,
        89,
        34,
        220,
        163,
        203
      ],
      "accounts": [
        {
          "name": "profile",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  102,
                  105,
                  108,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "player"
              }
            ]
          }
        },
        {
          "name": "wallet",
          "relations": [
            "profile"
          ]
        },
        {
          "name": "player",
          "signer": true
        }
      ],
      "args": [
        {
          "name": "avatarSource",
          "type": "u8"
        },
        {
          "name": "nftPfpMint",
          "type": "pubkey"
        },
        {
          "name": "cosmeticAvatarId",
          "type": "u16"
        }
      ]
    },
    {
      "name": "updateBio",
      "docs": [
        "Set or update bio. First call also creates the caller's ProfileExtV2",
        "PDA. Empty string allowed (clears the bio)."
      ],
      "discriminator": [
        201,
        29,
        45,
        117,
        230,
        37,
        55,
        183
      ],
      "accounts": [
        {
          "name": "profileExt",
          "docs": [
            "Created on first call (init_if_needed); mutated on subsequent calls."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  102,
                  105,
                  108,
                  101,
                  45,
                  101,
                  120,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "player"
              }
            ]
          }
        },
        {
          "name": "player",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "bio",
          "type": "string"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "arcadeConfig",
      "discriminator": [
        72,
        72,
        85,
        65,
        185,
        246,
        125,
        96
      ]
    },
    {
      "name": "game",
      "discriminator": [
        27,
        90,
        166,
        125,
        74,
        100,
        121,
        18
      ]
    },
    {
      "name": "handleClaim",
      "discriminator": [
        148,
        215,
        248,
        53,
        11,
        234,
        115,
        190
      ]
    },
    {
      "name": "playerProfile",
      "discriminator": [
        82,
        226,
        99,
        87,
        164,
        130,
        181,
        80
      ]
    },
    {
      "name": "profileExtV2",
      "discriminator": [
        58,
        234,
        55,
        37,
        188,
        153,
        253,
        213
      ]
    },
    {
      "name": "replayReceipt",
      "discriminator": [
        242,
        70,
        132,
        232,
        184,
        87,
        71,
        62
      ]
    },
    {
      "name": "stablecoinConfig",
      "discriminator": [
        127,
        25,
        244,
        213,
        1,
        192,
        101,
        6
      ]
    }
  ],
  "events": [
    {
      "name": "affiliateAccrued",
      "discriminator": [
        254,
        180,
        121,
        2,
        160,
        136,
        21,
        171
      ]
    },
    {
      "name": "affiliateAttributed",
      "discriminator": [
        93,
        100,
        1,
        187,
        31,
        168,
        113,
        107
      ]
    },
    {
      "name": "bioUpdated",
      "discriminator": [
        172,
        229,
        184,
        199,
        16,
        128,
        188,
        111
      ]
    },
    {
      "name": "configInitialized",
      "discriminator": [
        181,
        49,
        200,
        156,
        19,
        167,
        178,
        91
      ]
    },
    {
      "name": "gameRegistered",
      "discriminator": [
        2,
        83,
        36,
        122,
        249,
        190,
        106,
        31
      ]
    },
    {
      "name": "handleSet",
      "discriminator": [
        198,
        200,
        95,
        128,
        193,
        91,
        121,
        216
      ]
    },
    {
      "name": "paymentRecorded",
      "discriminator": [
        214,
        3,
        212,
        116,
        135,
        35,
        104,
        98
      ]
    },
    {
      "name": "profileExtOpened",
      "discriminator": [
        185,
        27,
        239,
        200,
        254,
        59,
        147,
        13
      ]
    },
    {
      "name": "profileOpened",
      "discriminator": [
        245,
        141,
        9,
        145,
        14,
        240,
        165,
        228
      ]
    },
    {
      "name": "replayReceiptClosed",
      "discriminator": [
        158,
        179,
        181,
        35,
        86,
        177,
        160,
        215
      ]
    },
    {
      "name": "replayReceiptMinted",
      "discriminator": [
        197,
        105,
        193,
        194,
        76,
        242,
        136,
        213
      ]
    },
    {
      "name": "replayReceiptTransferred",
      "discriminator": [
        53,
        25,
        114,
        100,
        227,
        229,
        65,
        134
      ]
    },
    {
      "name": "scoreSubmitted",
      "discriminator": [
        15,
        74,
        143,
        188,
        62,
        88,
        81,
        104
      ]
    },
    {
      "name": "seasonRotated",
      "discriminator": [
        154,
        15,
        96,
        13,
        222,
        172,
        94,
        109
      ]
    },
    {
      "name": "sessionReplayCommitted",
      "discriminator": [
        184,
        158,
        198,
        87,
        164,
        77,
        249,
        72
      ]
    },
    {
      "name": "stablecoinsInitialized",
      "discriminator": [
        45,
        164,
        89,
        182,
        45,
        83,
        91,
        30
      ]
    },
    {
      "name": "stablecoinsUpdated",
      "discriminator": [
        85,
        79,
        241,
        6,
        152,
        56,
        169,
        186
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "adminOnly",
      "msg": "Only the admin can call this instruction."
    },
    {
      "code": 6001,
      "name": "profileOwnerMismatch",
      "msg": "Profile owner does not match the signer."
    },
    {
      "code": 6002,
      "name": "slugTooLong",
      "msg": "Game slug exceeds the maximum length."
    },
    {
      "code": 6003,
      "name": "nameTooLong",
      "msg": "Game display name exceeds the maximum length."
    },
    {
      "code": 6004,
      "name": "invalidGameId",
      "msg": "Game ID must be > 0 and match config.next_game_id."
    },
    {
      "code": 6005,
      "name": "gameIdMismatch",
      "msg": "Game ID does not match the expected next_game_id."
    },
    {
      "code": 6006,
      "name": "gameIdOverflow",
      "msg": "Game ID counter overflowed u8."
    },
    {
      "code": 6007,
      "name": "overflow",
      "msg": "Integer overflow."
    },
    {
      "code": 6008,
      "name": "invalidAvatarSource",
      "msg": "Invalid avatar source (must be 0..=3)."
    },
    {
      "code": 6009,
      "name": "invalidCosmeticId",
      "msg": "Invalid cosmetic ID (out of bitmap range)."
    },
    {
      "code": 6010,
      "name": "cosmeticNotOwned",
      "msg": "Cosmetic not owned by this player."
    },
    {
      "code": 6011,
      "name": "variantTooLong",
      "msg": "Variant field too long."
    },
    {
      "code": 6012,
      "name": "metaTooLong",
      "msg": "Meta field too long."
    },
    {
      "code": 6013,
      "name": "memoTooLong",
      "msg": "GPX5 memo exceeds MAX_MEMO_LEN."
    },
    {
      "code": 6014,
      "name": "invalidDuration",
      "msg": "Session duration must be > 0."
    },
    {
      "code": 6015,
      "name": "invalidPaymentCategory",
      "msg": "Invalid payment category (must be 0..=3)."
    },
    {
      "code": 6016,
      "name": "paymentBelowMin",
      "msg": "Payment amount below minimum ($0.01 / 10_000 micro-USD)."
    },
    {
      "code": 6017,
      "name": "paymentAboveMax",
      "msg": "Payment amount above maximum ($100 / 100_000_000 micro-USD)."
    },
    {
      "code": 6018,
      "name": "selfReferralNotAllowed",
      "msg": "Self-referral is not allowed."
    },
    {
      "code": 6019,
      "name": "referrerProfileRequired",
      "msg": "Referrer must have an open PlayerProfile — referrer_profile account missing."
    },
    {
      "code": 6020,
      "name": "referrerProfileMismatch",
      "msg": "Passed referrer_profile does not match the expected referrer wallet."
    },
    {
      "code": 6021,
      "name": "externalRefTooLong",
      "msg": "external_ref string exceeds MAX_EXTERNAL_REF_LEN."
    },
    {
      "code": 6022,
      "name": "verifiedRefRequired",
      "msg": "VERIFIED payment must include an external_ref or be paired with commit_session_replay."
    },
    {
      "code": 6023,
      "name": "invalidScoreCommitAmount",
      "msg": "ScoreCommit amount must be exactly SCORE_COMMIT_MICRO_USD ($0.05)."
    },
    {
      "code": 6024,
      "name": "invalidVerifiedAmount",
      "msg": "VERIFIED commit amount must be exactly VERIFIED_COMMIT_MICRO_USD ($0.15)."
    },
    {
      "code": 6025,
      "name": "invalidReplayReceiptAmount",
      "msg": "ReplayReceipt mint amount must be exactly REPLAY_RECEIPT_MICRO_USD ($0.25)."
    },
    {
      "code": 6026,
      "name": "invalidCnftWrapAmount",
      "msg": "cNFT wrap amount must be exactly CNFT_WRAP_MICRO_USD ($0.50)."
    },
    {
      "code": 6027,
      "name": "notReceiptOwner",
      "msg": "Only the current receipt owner can call this instruction."
    },
    {
      "code": 6028,
      "name": "receiptWrappedAsCnft",
      "msg": "Receipt is wrapped as a cNFT — unwrap first before closing."
    },
    {
      "code": 6029,
      "name": "invalidScore",
      "msg": "Score must be > 0."
    },
    {
      "code": 6030,
      "name": "invalidNewOwner",
      "msg": "new_owner cannot be the default (zero) pubkey."
    },
    {
      "code": 6031,
      "name": "moveLogEmpty",
      "msg": "Move log is empty."
    },
    {
      "code": 6032,
      "name": "moveLogTooLong",
      "msg": "Move log exceeds MAX_MOVE_LOG_BYTES (400)."
    },
    {
      "code": 6033,
      "name": "paymentTransferNotFound",
      "msg": "No matching SPL TransferChecked of an accepted stablecoin to treasury found in tx."
    },
    {
      "code": 6034,
      "name": "requiredPaymentMissing",
      "msg": "Required record_payment of the expected category + amount was not bundled in the same tx."
    },
    {
      "code": 6035,
      "name": "duplicateIxInTx",
      "msg": "This instruction may appear at most once per tx."
    },
    {
      "code": 6036,
      "name": "instructionExpired",
      "msg": "Instruction deadline has expired."
    },
    {
      "code": 6037,
      "name": "deadlineTooFar",
      "msg": "Instruction deadline is too far in the future (> MAX_DEADLINE_FUTURE_SEC)."
    },
    {
      "code": 6038,
      "name": "gamerPaymentsDisabled",
      "msg": "$GAMER-paid actions are not yet supported (v1.3)."
    },
    {
      "code": 6039,
      "name": "handleTooShort",
      "msg": "Handle too short (min 3 chars)."
    },
    {
      "code": 6040,
      "name": "handleTooLong",
      "msg": "Handle too long (max 32 chars)."
    },
    {
      "code": 6041,
      "name": "handleInvalidChars",
      "msg": "Handle contains invalid characters (allowed: a-z, 0-9, _)."
    },
    {
      "code": 6042,
      "name": "handleReserved",
      "msg": "Handle is reserved."
    },
    {
      "code": 6043,
      "name": "handleUnchanged",
      "msg": "Handle is unchanged — no-op rejected (would conflict with itself in same tx)."
    },
    {
      "code": 6044,
      "name": "bioTooLong",
      "msg": "Bio too long (max 140 bytes)."
    },
    {
      "code": 6045,
      "name": "bioInvalidChars",
      "msg": "Bio contains forbidden control characters."
    },
    {
      "code": 6046,
      "name": "handleClaimMismatch",
      "msg": "HandleClaim wallet does not match the signer."
    },
    {
      "code": 6047,
      "name": "oldHandleClaimRequired",
      "msg": "Wallet already has a handle; the existing HandleClaim must be passed for rent refund."
    },
    {
      "code": 6048,
      "name": "oldHandleClaimUnexpected",
      "msg": "Wallet has no current handle — do not pass an old HandleClaim."
    }
  ],
  "types": [
    {
      "name": "affiliateAccrued",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "player",
            "type": "pubkey"
          },
          {
            "name": "referrer",
            "type": "pubkey"
          },
          {
            "name": "gameId",
            "type": "u8"
          },
          {
            "name": "cutMicroUsd",
            "type": "u64"
          },
          {
            "name": "gamerPaid",
            "type": "bool"
          },
          {
            "name": "paymentsRemaining",
            "type": "u8"
          },
          {
            "name": "expiresAt",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "affiliateAttributed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "player",
            "type": "pubkey"
          },
          {
            "name": "referrer",
            "type": "pubkey"
          },
          {
            "name": "expiresAt",
            "type": "i64"
          },
          {
            "name": "paymentsAllotted",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "arcadeConfig",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "treasuryWallet",
            "type": "pubkey"
          },
          {
            "name": "currentSeason",
            "type": "u16"
          },
          {
            "name": "nextGameId",
            "type": "u8"
          },
          {
            "name": "totalGamesRegistered",
            "type": "u32"
          },
          {
            "name": "totalScoreCommits",
            "type": "u64"
          },
          {
            "name": "totalProfilesOpened",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "bioUpdated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "wallet",
            "type": "pubkey"
          },
          {
            "name": "bioLen",
            "type": "u16"
          },
          {
            "name": "updatedAt",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "configInitialized",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "treasuryWallet",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "game",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "gameId",
            "type": "u8"
          },
          {
            "name": "slug",
            "type": "string"
          },
          {
            "name": "displayName",
            "type": "string"
          },
          {
            "name": "totalSessions",
            "type": "u64"
          },
          {
            "name": "totalScoreCommits",
            "type": "u64"
          },
          {
            "name": "createdAt",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "gameRegistered",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "gameId",
            "type": "u8"
          },
          {
            "name": "slug",
            "type": "string"
          },
          {
            "name": "displayName",
            "type": "string"
          }
        ]
      }
    },
    {
      "name": "handleClaim",
      "docs": [
        "Global uniqueness ledger for handles. Existence at",
        "[HANDLE_CLAIM_SEED, handle.as_bytes()] IS the claim. Closed and re-init'd",
        "on handle change so the rent is recovered."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "wallet",
            "docs": [
              "The wallet whose ProfileExtV2 currently owns this handle."
            ],
            "type": "pubkey"
          },
          {
            "name": "claimedAt",
            "docs": [
              "Unix seconds when claim was created."
            ],
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "handleSet",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "wallet",
            "type": "pubkey"
          },
          {
            "name": "oldHandle",
            "type": "string"
          },
          {
            "name": "newHandle",
            "type": "string"
          },
          {
            "name": "setAt",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "paymentRecorded",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "gameId",
            "type": "u8"
          },
          {
            "name": "player",
            "type": "pubkey"
          },
          {
            "name": "category",
            "type": "u8"
          },
          {
            "name": "amountMicroUsd",
            "type": "u64"
          },
          {
            "name": "paymentTxSig",
            "type": {
              "array": [
                "u8",
                64
              ]
            }
          },
          {
            "name": "gamerPaid",
            "type": "bool"
          },
          {
            "name": "externalRef",
            "type": "string"
          }
        ]
      }
    },
    {
      "name": "playerProfile",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "wallet",
            "type": "pubkey"
          },
          {
            "name": "totalSessions",
            "type": "u64"
          },
          {
            "name": "totalScoreCommits",
            "type": "u64"
          },
          {
            "name": "totalSpentUsdcMicro",
            "type": "u64"
          },
          {
            "name": "totalSpentGamerMicro",
            "type": "u64"
          },
          {
            "name": "totalGamerEarned",
            "type": "u64"
          },
          {
            "name": "favoriteGameId",
            "type": "u8"
          },
          {
            "name": "vipStakeAmount",
            "type": "u64"
          },
          {
            "name": "cosmeticsOwned",
            "type": {
              "array": [
                "u32",
                16
              ]
            }
          },
          {
            "name": "avatarSource",
            "type": "u8"
          },
          {
            "name": "nftPfpMint",
            "type": "pubkey"
          },
          {
            "name": "cosmeticAvatarId",
            "type": "u16"
          },
          {
            "name": "createdAt",
            "type": "i64"
          },
          {
            "name": "referrer",
            "docs": [
              "Who referred this player via a challenge link. Pubkey::default() if",
              "none. Set once at open_player_profile; NEVER changed afterward."
            ],
            "type": "pubkey"
          },
          {
            "name": "referrerExpiresAt",
            "docs": [
              "Unix seconds when the affiliate tail window expires."
            ],
            "type": "i64"
          },
          {
            "name": "referrerPaymentsRemaining",
            "docs": [
              "How many more payments still accrue to the referrer (decrements)."
            ],
            "type": "u8"
          },
          {
            "name": "totalReferredPayoutsMicro",
            "docs": [
              "Cumulative micro-USD this player has generated as affiliate payouts",
              "to the referrer (lifetime, monotonic, audit trail)."
            ],
            "type": "u64"
          },
          {
            "name": "affiliateEarnedAccruedMicro",
            "docs": [
              "Accrued but unclaimed affiliate earnings (in micro-USD). Grows with",
              "every referred player's payment while their tail is active. Unclaimed",
              "until Phase 2 `claim_affiliate_payout` ships; can be audited via",
              "AffiliateAccrued events in the meantime."
            ],
            "type": "u64"
          },
          {
            "name": "affiliateEarnedLifetimeMicro",
            "docs": [
              "Lifetime total earned via affiliate (for display + audit)."
            ],
            "type": "u64"
          },
          {
            "name": "affiliateReferredPayers",
            "docs": [
              "Count of distinct referred players who've ever paid something."
            ],
            "type": "u32"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "profileExtOpened",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "wallet",
            "type": "pubkey"
          },
          {
            "name": "createdAt",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "profileExtV2",
      "docs": [
        "Identity-layer extension PDA. Holds handle + bio + version. Created lazily",
        "on first `set_handle` / `update_bio` via `init_if_needed`. Sibling of the",
        "PlayerProfile PDA — matches the StablecoinConfig pattern above. Keeps the",
        "existing PlayerProfile layout / rent / live devnet accounts undisturbed,",
        "and lets non-gameplay surfaces (Sledgit identity-only users) have a handle",
        "without opening a PlayerProfile.",
        "",
        "Seeds: [PROFILE_EXT_SEED, wallet.as_ref()]"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "wallet",
            "docs": [
              "Mirrors the seed. Set once on fresh init; never modified."
            ],
            "type": "pubkey"
          },
          {
            "name": "profileVersion",
            "docs": [
              "Schema version (currently 2)."
            ],
            "type": "u8"
          },
          {
            "name": "handle",
            "docs": [
              "User-chosen handle. Charset [a-z0-9_], 3-32 bytes. Empty until first",
              "set_handle. Backed by a HandleClaim PDA at [HANDLE_CLAIM_SEED, handle]."
            ],
            "type": "string"
          },
          {
            "name": "bio",
            "docs": [
              "Free-form bio. Max 140 UTF-8 bytes. Empty until first update_bio."
            ],
            "type": "string"
          },
          {
            "name": "createdAt",
            "docs": [
              "Unix seconds when this ext was created. Immutable after fresh init."
            ],
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "profileOpened",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "wallet",
            "type": "pubkey"
          },
          {
            "name": "createdAt",
            "type": "i64"
          },
          {
            "name": "referrer",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "replayReceipt",
      "docs": [
        "ReplayReceipt — user-owned, transferable certificate of a completed run.",
        "",
        "Key invariants (baked into the program — not mutable by any instruction):",
        "- `original_player` is stamped at mint time and NEVER modified.",
        "Even if the receipt is sold or transferred, the original player",
        "attribution stays in history forever (same model as NBA Top Shot,",
        "CryptoPunks: creator is immutable, owner is transferable).",
        "- `owner` starts equal to `original_player` and can only be changed",
        "via the explicit `transfer_replay_receipt` instruction, which",
        "requires the current owner's signature.",
        "- Leaderboards ALWAYS key on `original_player`, never on `owner`.",
        "This prevents pay-to-win on leaderboards via receipt purchases.",
        "",
        "The canonical replay data (move log) lives permanently as a GPX5R memo",
        "in Solana tx history; this PDA is a transferable pointer to it."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "originalPlayer",
            "type": "pubkey"
          },
          {
            "name": "gameId",
            "type": "u8"
          },
          {
            "name": "score",
            "type": "u64"
          },
          {
            "name": "continuesUsed",
            "type": "u8"
          },
          {
            "name": "powerupsUsed",
            "type": "u8"
          },
          {
            "name": "sessionSeed",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "moveHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "durationSec",
            "type": "u32"
          },
          {
            "name": "gpx5rMemoTx",
            "type": {
              "array": [
                "u8",
                64
              ]
            }
          },
          {
            "name": "mintedAt",
            "type": "i64"
          },
          {
            "name": "season",
            "type": "u16"
          },
          {
            "name": "nonce",
            "type": "u64"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "cnftWrapped",
            "type": "bool"
          },
          {
            "name": "cnftAssetId",
            "type": "pubkey"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "replayReceiptClosed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "originalPlayer",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "nonce",
            "type": "u64"
          },
          {
            "name": "gameId",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "replayReceiptMinted",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "originalPlayer",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "gameId",
            "type": "u8"
          },
          {
            "name": "score",
            "type": "u64"
          },
          {
            "name": "nonce",
            "type": "u64"
          },
          {
            "name": "gpx5rMemoTx",
            "type": {
              "array": [
                "u8",
                64
              ]
            }
          }
        ]
      }
    },
    {
      "name": "replayReceiptTransferred",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "originalPlayer",
            "type": "pubkey"
          },
          {
            "name": "prevOwner",
            "type": "pubkey"
          },
          {
            "name": "newOwner",
            "type": "pubkey"
          },
          {
            "name": "nonce",
            "type": "u64"
          },
          {
            "name": "gameId",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "scoreSubmitted",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "gameId",
            "type": "u8"
          },
          {
            "name": "player",
            "type": "pubkey"
          },
          {
            "name": "score",
            "type": "u64"
          },
          {
            "name": "continuesUsed",
            "type": "u8"
          },
          {
            "name": "powerupsUsed",
            "type": "u8"
          },
          {
            "name": "durationSec",
            "type": "u32"
          },
          {
            "name": "season",
            "type": "u16"
          }
        ]
      }
    },
    {
      "name": "seasonRotated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "newSeason",
            "type": "u16"
          }
        ]
      }
    },
    {
      "name": "sessionReplayCommitted",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "player",
            "type": "pubkey"
          },
          {
            "name": "scoreNonce",
            "type": "u64"
          },
          {
            "name": "moveLogBytes",
            "type": "u16"
          }
        ]
      }
    },
    {
      "name": "stablecoinConfig",
      "docs": [
        "Allowlist of stablecoin mints accepted for arcade payments. Stored in a",
        "separate PDA (not ArcadeConfig) so the existing config's rent / layout is",
        "undisturbed — avoids a painful realloc migration on the already-deployed",
        "devnet account.",
        "",
        "Initialised once by the admin via `initialize_stablecoins`, updated via",
        "`update_accepted_stablecoins` (deadline-gated). Empty slots = `Pubkey::default()`."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "mints",
            "type": {
              "array": [
                "pubkey",
                8
              ]
            }
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "stablecoinsInitialized",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mints",
            "type": {
              "array": [
                "pubkey",
                8
              ]
            }
          }
        ]
      }
    },
    {
      "name": "stablecoinsUpdated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mints",
            "type": {
              "array": [
                "pubkey",
                8
              ]
            }
          }
        ]
      }
    }
  ]
};
