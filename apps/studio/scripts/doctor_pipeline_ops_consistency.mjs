const API_BASE = process.env.API_BASE || "http://localhost:3000";
const STORY_SLUG = process.env.DOCTOR_STORY_SLUG || "the_subcurrent";

function deriveKpi(jobs) {
  const rows = Array.isArray(jobs) ? jobs : [];
  return {
    total_jobs: rows.length,
    running_jobs: rows.filter((j) => String(j.status || "").toUpperCase() === "RUNNING").length,
    failed_jobs: rows.filter((j) => String(j.status || "").toUpperCase() === "FAILED").length,
    wait_review_jobs: rows.filter((j) => String(j.status || "").toUpperCase() === "AWAIT_APPROVAL").length,
    done_jobs: rows.filter((j) => String(j.status || "").toUpperCase() === "DONE").length,
  };
}

function mismatch(apiKpi, derived) {
  const out = [];
  for (const k of ["total_jobs", "running_jobs", "failed_jobs", "wait_review_jobs", "done_jobs"]) {
    if (Number(apiKpi?.[k] ?? -1) !== Number(derived?.[k] ?? -2)) {
      out.push(`${k}(api=${apiKpi?.[k]},derived=${derived?.[k]})`);
    }
  }
  return out;
}

async function main() {
  const url = `${API_BASE}/api/${encodeURIComponent(STORY_SLUG)}/pipelines/overview`;
  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.ok === false) {
    throw new Error(`overview failed: ${res.status} ${JSON.stringify(json)}`);
  }

  const jobs = Array.isArray(json.jobs) ? json.jobs : [];
  const alerts = Array.isArray(json.alerts) ? json.alerts : [];
  const derived = deriveKpi(jobs);
  const diffs = mismatch(json.kpi || {}, derived);
  if (diffs.length > 0) {
    throw new Error(`kpi mismatch: ${diffs.join(", ")}`);
  }
  if (Number(json.health?.alert_count ?? -1) !== alerts.length) {
    throw new Error(`alert_count mismatch: health=${json.health?.alert_count} alerts=${alerts.length}`);
  }
  if (json.contract_version !== "pipeline_overview_v1") {
    throw new Error(`unexpected contract_version: ${json.contract_version}`);
  }

  console.log(`[doctor] PASS story=${STORY_SLUG}`);
  console.log(`[doctor] jobs=${jobs.length} alerts=${alerts.length} generated_at=${json.generated_at || "-"}`);
}

main().catch((err) => {
  console.error("[doctor] FAIL", err);
  process.exit(1);
});
