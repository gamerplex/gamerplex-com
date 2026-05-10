import { redirect } from "next/navigation";

export default async function ArcadeCyberSnakeRedirect({
  searchParams,
}: {
  searchParams: Promise<{ challenge?: string | string[] }>;
}) {
  const sp = await searchParams;
  const raw = sp?.challenge;
  const sig = Array.isArray(raw) ? raw[0] : raw;
  const qs = sig ? `&challenge=${encodeURIComponent(sig)}` : "";
  redirect(`/play/cyber-snake?mode=arcade${qs}`);
}
