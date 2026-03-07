#!/usr/bin/env node
/**
 * Quick E2E probe for feedback template:
 * [TOKEN] + [Scene/Line] + [Reason]
 *
 * Usage:
 *   STORY_SLUG=the_subcurrent JOB_ID=123 TASK_ID=456 node apps/studio/scripts/test_feedback_template.mjs
 */

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const storySlug = process.env.STORY_SLUG || "the_subcurrent";
const jobId = process.env.JOB_ID;
const taskId = process.env.TASK_ID;

if (!jobId || !taskId) {
  console.error("Missing JOB_ID or TASK_ID");
  process.exit(1);
}

const body = {
  chapter_id: process.env.CHAPTER_ID || "ch01",
  strategy: process.env.STRATEGY || "S1_STRICT_BOUNDARY",
  rating: Number(process.env.RATING || "-1"),
  issue_code: process.env.ISSUE_CODE || "SCENE_OVERDENSE",
  note:
    process.env.NOTE ||
    "SCENE_OVERDENSE + Scene 5, lines 10-22 + World-building mixed with action causes pacing drop",
  created_by: process.env.CREATED_BY || "ops_probe",
};

const url = `${baseUrl}/api/${storySlug}/ingest/jobs/${jobId}/chapters/${taskId}/feedback`;

const res = await fetch(url, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

const json = await res.json().catch(() => ({}));

console.log(JSON.stringify({ status: res.status, ok: res.ok, url, response: json }, null, 2));
process.exit(res.ok ? 0 : 2);
