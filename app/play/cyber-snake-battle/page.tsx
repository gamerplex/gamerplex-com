import { redirect } from "next/navigation";

export default async function CyberSnakeBattleRedirect({
  searchParams,
}: {
  searchParams: Promise<{ match?: string | string[] }>;
}) {
  const sp = await searchParams;
  const raw = sp?.match;
  const match = Array.isArray(raw) ? raw[0] : raw;
  const qs = match ? `&match=${encodeURIComponent(match)}` : "";
  redirect(`/play/cyber-snake?mode=battle${qs}`);
}
