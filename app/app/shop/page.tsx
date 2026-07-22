"use client";

import { useEffect } from "react";

import ShopView from "../../shop/ShopView";

export default function AppShop() {
  useEffect(() => {
    try { localStorage.setItem("gpx_seen_shop", "1"); } catch { /* no-op */ }
  }, []);
  return <ShopView />;
}
