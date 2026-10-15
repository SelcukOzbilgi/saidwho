import { CASES, findCase } from "@/cases/cases";
import { SHARE_ALT, SHARE_SIZE, shareCard } from "@/components/share-card";

// One share image per case, drawn at build time like the case pages.
export const dynamicParams = false;
export const alt = SHARE_ALT;
export const size = SHARE_SIZE;
export const contentType = "image/png";

export function generateStaticParams() {
  return CASES.map(({ caseId }) => ({ id: caseId }));
}

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const found = findCase((await params).id);
  if (!found) return new Response("Not found", { status: 404 });
  return shareCard(found);
}
