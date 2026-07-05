import type { Page } from '@playwright/test';

// Injects a fake Phantom wallet (window.solana, isPhantom) BEFORE app scripts run,
// so PhantomWalletAdapter detects it as "Installed" and the whole wallet-adapter
// flow (Select Wallet → connect → signMessage) works headlessly. Signatures are
// arbitrary bytes — tests that need the SIWS backend mock its endpoints, so no real
// cryptography is required.

// A fixed, valid 32-byte pubkey (base58 renders deterministically).
export const MOCK_PUBKEY_BYTES = Array.from({ length: 32 }, (_, i) => (i * 7 + 3) % 251);

export async function installMockWallet(page: Page): Promise<void> {
  await page.addInitScript((pkBytes: number[]) => {
    const bytes = new Uint8Array(pkBytes);
    const publicKey = {
      toBytes: () => bytes,
      toBuffer: () => bytes,
    };
    const listeners: Record<string, Array<(...a: unknown[]) => void>> = {};
    const emit = (e: string, ...a: unknown[]) => (listeners[e] || []).forEach((f) => f(...a));

    const wallet = {
      isPhantom: true,
      publicKey,
      isConnected: false,
      connect: async () => {
        wallet.isConnected = true;
        emit('connect', publicKey);
        return { publicKey };
      },
      disconnect: async () => {
        wallet.isConnected = false;
        emit('disconnect');
      },
      signMessage: async (_message: Uint8Array) => ({
        signature: new Uint8Array(64).fill(7),
        publicKey,
      }),
      signTransaction: async (tx: unknown) => tx,
      signAllTransactions: async (txs: unknown[]) => txs,
      on: (e: string, f: (...a: unknown[]) => void) => {
        (listeners[e] = listeners[e] || []).push(f);
      },
      off: (e: string, f: (...a: unknown[]) => void) => {
        listeners[e] = (listeners[e] || []).filter((g) => g !== f);
      },
      removeListener: (e: string, f: (...a: unknown[]) => void) => {
        listeners[e] = (listeners[e] || []).filter((g) => g !== f);
      },
    };

    // Both discovery paths the adapter checks.
    (window as unknown as { solana: unknown }).solana = wallet;
    (window as unknown as { phantom: unknown }).phantom = { solana: wallet };
  }, MOCK_PUBKEY_BYTES);
}

// Mock the SIWS + session endpoints for a full wallet sign-in. `emailVerified`
// controls whether the wallet step is unlocked (email-first gate).
export async function mockSiwsBackend(
  page: Page,
  opts: { emailVerified?: boolean; withWallet?: boolean } = {},
): Promise<void> {
  const walletAddress = opts.withWallet ? 'MockWa11etAdd35500000000000000000000000000' : null;
  const user = {
    id: 'e2e-wallet-user',
    email: 'e2e@example.com',
    emailVerified: opts.emailVerified ?? true,
    walletAddress,
    handle: 'e2e',
  };
  await page.route('**/api/auth/me', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user }) }),
  );
  await page.route('**/api/auth/wallet/siws', (r) => {
    if (r.request().method() === 'POST') {
      user.walletAddress = 'MockWa11etAdd35500000000000000000000000000';
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'login', walletAddress: user.walletAddress }) });
    }
    // GET → challenge
    return r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ domain: 'gamerplex.com', nonce: 'e2e-nonce', issuedAt: '2026-01-01T00:00:00.000Z' }),
    });
  });
}
