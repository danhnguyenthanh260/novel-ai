"use client";

import dynamic from "next/dynamic";

const MarkdownLitePreview = dynamic(() => import("@/features/muse/components/MarkdownLitePreview"), {
  ssr: false,
  loading: () => <div className="muted text-xs">Loading preview...</div>,
});

export default MarkdownLitePreview;
