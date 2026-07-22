import type { Metadata } from "next";
import ShopView from "./ShopView";

export const metadata: Metadata = {
  title: "Shop — Power-ups & Cosmetics | Gamerplex",
  description:
    "Spend Credits (earned by playing) or $GAME on power-ups and cosmetics. No wallet needed for Credits.",
};

export default function ShopPage() {
  return <ShopView />;
}
