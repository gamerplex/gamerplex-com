import { Buffer } from "buffer";
import {
  Connection,
  PublicKey,
  Transaction,
  Keypair,
  sendAndConfirmTransaction,
  TransactionInstruction,
  SystemProgram,
} from "@solana/web3.js";
import * as crypto from "crypto";

const RESOLVER = process.env.NEXT_PUBLIC_RESOLVER_URL || "https://resolver.gamerplex.com";
const WORDS_PROGRAM_ID = new PublicKey("3XA1rz4f83FoTyvB7g1XHhsb4bx9SrUSBDtpLtAttU4o");
const GAME_SEED = Buffer.from("magic_words");
const HIDDEN_SEED = Buffer.from("hidden_word");
const MAX_WORD_LEN = 20;

function disc(name: string): Buffer {
  const hash = crypto.createHash("sha256").update(`global:${name}`).digest();
  return Buffer.from(hash.subarray(0, 8));
}

const DISC = {
  create_game: disc("create_game"),
  join_game: disc("join_game"),
  guess_letter: disc("guess_letter"),
  reveal_word: disc("reveal_word"),
};

function padWord(word: string): Buffer {
  const buf = Buffer.alloc(MAX_WORD_LEN, 0);
  Buffer.from(word.toLowerCase(), "ascii").copy(buf);
  return buf;
}

export class BlockwordsOnChain {
  erConnection: Connection | null = null;
  hostKey: Keypair | null = null;
  guesserKey: Keypair | null = null;
  gamePda: PublicKey | null = null;
  hiddenPda: PublicKey | null = null;
  gameId: number = 0;
  erRpc: string = "";
  ready: boolean = false;
  word: string = "";

  async createGame(word: string, maxWrong: number = 6, mode: number = 0): Promise<boolean> {
    try {
      this.word = word.toLowerCase();
      this.hostKey = Keypair.generate();
      this.guesserKey = Keypair.generate();
      this.gameId = Date.now();
      this.erRpc = "https://devnet.magicblock.app";
      this.erConnection = new Connection(this.erRpc, "confirmed");

      const [gamePda] = PublicKey.findProgramAddressSync(
        [GAME_SEED, Buffer.from(new BigUint64Array([BigInt(this.gameId)]).buffer)],
        WORDS_PROGRAM_ID
      );
      const [hiddenPda] = PublicKey.findProgramAddressSync(
        [HIDDEN_SEED, Buffer.from(new BigUint64Array([BigInt(this.gameId)]).buffer)],
        WORDS_PROGRAM_ID
      );
      this.gamePda = gamePda;
      this.hiddenPda = hiddenPda;

      const res = await fetch(`${RESOLVER}/game-pool/create-words`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          word: this.word,
          wordLen: this.word.length,
          maxWrong,
          mode,
          gameId: this.gameId,
        }),
      });

      if (!res.ok) {
        console.warn("[BLOCKWORDS] Resolver not available, playing locally");
        this.ready = false;
        return false;
      }

      const data = await res.json();
      if (data.ok && data.game) {
        this.gamePda = new PublicKey(data.game.gamePda);
        this.hiddenPda = new PublicKey(data.game.hiddenPda);
        if (data.game.hostSecret) {
          this.hostKey = Keypair.fromSecretKey(new Uint8Array(data.game.hostSecret));
        }
        if (data.game.guesserSecret) {
          this.guesserKey = Keypair.fromSecretKey(new Uint8Array(data.game.guesserSecret));
        }
        this.ready = true;
        console.log(`[BLOCKWORDS] Game created on ER: ${this.gamePda.toBase58().slice(0, 12)}...`);
        return true;
      }

      this.ready = false;
      return false;
    } catch (e: any) {
      console.error("[BLOCKWORDS] Create failed:", e.message);
      this.ready = false;
      return false;
    }
  }

  async guessLetter(letter: string): Promise<string | null> {
    if (!this.ready || !this.erConnection || !this.guesserKey || !this.gamePda || !this.hiddenPda) return null;

    try {
      const letterIdx = letter.charCodeAt(0) - 97;
      if (letterIdx < 0 || letterIdx > 25) return null;

      const data = Buffer.alloc(8 + 8 + 1);
      DISC.guess_letter.copy(data, 0);
      data.writeBigUInt64LE(BigInt(this.gameId), 8);
      data.writeUInt8(letterIdx, 16);

      const ix = new TransactionInstruction({
        programId: WORDS_PROGRAM_ID,
        keys: [
          { pubkey: this.gamePda, isSigner: false, isWritable: true },
          { pubkey: this.hiddenPda, isSigner: false, isWritable: false },
          { pubkey: this.guesserKey.publicKey, isSigner: true, isWritable: false },
        ],
        data,
      });

      const sig = await sendAndConfirmTransaction(
        this.erConnection,
        new Transaction().add(ix),
        [this.guesserKey],
        { skipPreflight: true }
      );

      console.log(`[BLOCKWORDS] Guess '${letter}' TX: ${sig.slice(0, 20)}...`);
      return sig;
    } catch (e: any) {
      console.error(`[BLOCKWORDS] Guess failed:`, e.message?.slice(0, 100));
      return null;
    }
  }

  async finish(playerWallet?: string, result?: { won: boolean; wrongGuesses: number; word: string }): Promise<boolean> {
    if (!this.gamePda) return false;

    try {
      const res = await fetch(`${RESOLVER}/game-pool/finish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gamePda: this.gamePda.toBase58(),
          playerWallet,
          result: result ? {
            winner: result.won ? "white" : "black",
            moves: result.wrongGuesses,
          } : undefined,
          gameType: "blockwords",
        }),
      });

      const data = await res.json();
      return data.ok;
    } catch (e: any) {
      console.error("[BLOCKWORDS] Finish failed:", e.message);
      return false;
    }
  }

  get isReady(): boolean {
    return this.ready;
  }

  static explorerUrl(sig: string): string {
    return `https://explorer.solana.com/tx/${sig}?cluster=custom&customUrl=${encodeURIComponent("https://devnet.magicblock.app")}`;
  }
}
