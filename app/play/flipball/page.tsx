// FLIPBALL — pinball-style arcade game, built for the Flipcash community
// as a demo of the Gamerplex stack (PDA + $GAME utility).
//
// Lore: bumpers are named after Ted Livingston's product lineage —
// KIN → CODE → FLIPCASH → USDF. Each bumper has its own score value
// reflecting roughly the "maturity" of that product in the lineage.
//
// Phase 1 (this commit): playable pinball MVP, localStorage high score, wallet-connect stub.
// Phase 2 (post-arcade-mainnet): on-chain "Save to PDA" via SOL payment.
// Phase 3: in-game continues/power-ups via $GAME (20% discount) / USDC / SOL.
//
// Lives at /play/flipball (matches magic-chess / cyber-snake / blockwords convention).
// Wallet provider inherited from app/play/layout.tsx.

import type { Metadata } from 'next';
import Game from './Game.client';

export const metadata: Metadata = {
  title: 'FLIPBALL — Gamerplex',
  description:
    'Pinball on Solana. Free to play. Save your high score on-chain. Built for the Flipcash community — bumpers named after Kin, Code, Flipcash, USDF.',
  openGraph: {
    title: 'FLIPBALL — Pinball on Solana',
    description:
      'Free pinball, $GAME power-ups, on-chain high scores. Built on Gamerplex.',
    type: 'website',
  },
};

export default function FlipballPage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        background:
          'radial-gradient(ellipse at top, #1a0033 0%, #0d001a 60%, #050010 100%)',
        color: '#fff',
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '24px 16px 48px',
      }}
    >
      <header
        style={{
          width: '100%',
          maxWidth: 640,
          marginBottom: 14,
          textAlign: 'center',
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: 44,
            fontWeight: 900,
            letterSpacing: '-1.5px',
            background:
              'linear-gradient(135deg, #00ffd1 0%, #ff00aa 50%, #ffaa00 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            textShadow: '0 0 60px rgba(0, 255, 209, 0.35)',
          }}
        >
          FLIPBALL
        </h1>
        <p
          style={{
            margin: '4px 0 0',
            fontSize: 13,
            color: 'rgba(255, 255, 255, 0.65)',
            fontWeight: 500,
            letterSpacing: '0.3px',
          }}
        >
          A Gamerplex × Flipcash community game · KIN → CODE → FLIPCASH → USDF
        </p>
      </header>

      <Game />

      <footer
        style={{
          width: '100%',
          maxWidth: 520,
          marginTop: 24,
          fontSize: 12,
          color: 'rgba(255, 255, 255, 0.45)',
          lineHeight: 1.7,
          textAlign: 'center',
        }}
      >
        <p style={{ margin: 0 }}>
          <strong style={{ color: 'rgba(255, 255, 255, 0.75)' }}>How to play:</strong>{' '}
          ← / → arrow keys (or tap left / right halves on mobile) work the
          flippers. Space launches a ball. Three balls per game.
        </p>
        <p style={{ marginTop: 12 }}>
          <strong style={{ color: 'rgba(255, 255, 255, 0.75)' }}>Roadmap:</strong>{' '}
          Phase 2 — save scores on-chain for ~$0.05 in SOL. Phase 3 —
          continues + power-ups via $GAME (20% discount), USDC, or SOL.
          Built on{' '}
          <a href="https://gamerplex.com" style={{ color: '#00ffd1', textDecoration: 'none', borderBottom: '1px dashed #00ffd1' }}>
            Gamerplex
          </a>{' '}
          · Powered by the Flipcash ecosystem
        </p>
      </footer>
    </main>
  );
}
