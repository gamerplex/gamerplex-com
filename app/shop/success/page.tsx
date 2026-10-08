// /shop/success?item=<id> — the moment a Flipcash purchase lands.
//
// A Flipcash payment is not synchronous: the buyer pays in the chat, a watcher sees
// it seconds later, and only then does the item exist. So this page cannot simply
// assert success — it WAITS for it, and says honestly which state it is in. Claiming
// "purchased!" before the grant would be the shop lying about money.
//
// Truth comes from /api/inventory, the same durable record the Shop reads, so this
// page can never celebrate something a reload would take away.

import type { Metadata } from "next";
import { Suspense } from "react";

import PurchaseSuccess from "./PurchaseSuccess";

export const metadata: Metadata = {
  title: "Purchase",
  description: "Your Flipcash purchase.",
};

export const dynamic = "force-dynamic";

export default function ShopSuccessPage() {
  return (
    <Suspense fallback={null}>
      <PurchaseSuccess />
    </Suspense>
  );
}
