"use client";

import { IngestJobsPageView } from "@/features/ingest/components/ingestJobs/IngestJobsPageView";
import { useIngestJobsController } from "@/features/ingest/hooks/useIngestJobsController";

export default function IngestJobsClient({ storySlug }: { storySlug: string }) {
  const state = useIngestJobsController(storySlug);
  return <IngestJobsPageView storySlug={storySlug} state={state} />;
}
