import ReaderPageClient from "@/features/story/components/ReaderPageClient";

export const runtime = "nodejs";

export default async function ReaderPage({
  params,
}: {
  params: Promise<{ slug: string; chapter: string }>;
}) {
  const { slug, chapter } = await params;
  return <ReaderPageClient slug={slug} chapterId={chapter} />;
}
