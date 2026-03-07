const API_BASE = process.env.API_BASE || "http://localhost:3000";
const STORY_SLUG = process.env.DOCTOR_STORY_SLUG || "the_subcurrent";
const LATENCY_THRESHOLD_MS = Number(process.env.INSPECTOR_LITE_MAX_MS || 1200);

function hasKeys(obj, keys) {
  return keys.every((k) => Object.prototype.hasOwnProperty.call(obj || {}, k));
}

async function fetchJson(url) {
  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.ok === false) {
    throw new Error(`${url} -> ${res.status} ${JSON.stringify(json)}`);
  }
  return json;
}

async function main() {
  const overviewUrl = `${API_BASE}/api/${encodeURIComponent(STORY_SLUG)}/pipelines/overview`;
  const overview = await fetchJson(overviewUrl);
  const jobs = Array.isArray(overview.jobs) ? overview.jobs : [];
  const job = jobs[0];
  if (!job?.id) {
    throw new Error("no jobs found for inspector-lite doctor");
  }

  const graphUrl = `${API_BASE}/api/${encodeURIComponent(STORY_SLUG)}/pipelines/${job.id}/graph`;
  const graph = await fetchJson(graphUrl);
  const nodes = Array.isArray(graph?.graph?.nodes) ? graph.graph.nodes : [];
  const taskNode = nodes.find((n) => n?.interactive !== false && String(n.kind || "").toUpperCase() !== "GROUP");
  if (!taskNode?.key) {
    throw new Error(`no interactive task node found for job ${job.id}`);
  }

  const urlA = `${API_BASE}/api/${encodeURIComponent(STORY_SLUG)}/pipelines/${job.id}/nodes/${encodeURIComponent(taskNode.key)}/inspector-lite`;
  const t0 = Date.now();
  const liteA = await fetchJson(urlA);
  const latencyA = Date.now() - t0;
  if (latencyA > LATENCY_THRESHOLD_MS) {
    throw new Error(`inspector-lite latency too high: ${latencyA}ms > ${LATENCY_THRESHOLD_MS}ms`);
  }

  const requiredRoot = ["identity", "narrative", "data", "config", "runtime_refs", "fallback_markers", "links"];
  if (!hasKeys(liteA, requiredRoot)) {
    throw new Error(`inspector-lite missing keys: required=${requiredRoot.join(",")}`);
  }
  if (!Array.isArray(liteA.items) || !Array.isArray(liteA.trace_items)) {
    throw new Error("inspector-lite items/trace_items must be arrays");
  }

  const urlB = `${API_BASE}/api/${encodeURIComponent(STORY_SLUG)}/pipelines/jobs/${job.id}/nodes/${encodeURIComponent(taskNode.key)}/inspector-lite`;
  const liteB = await fetchJson(urlB);
  if (Number(liteA.job_id) !== Number(liteB.job_id) || String(liteA.node_key) !== String(liteB.node_key)) {
    throw new Error("inspector-lite alias route mismatch");
  }

  console.log(`[doctor] PASS story=${STORY_SLUG} job=${job.id} node=${taskNode.key}`);
  console.log(`[doctor] latency_ms=${latencyA} threshold_ms=${LATENCY_THRESHOLD_MS}`);
}

main().catch((err) => {
  console.error("[doctor] FAIL", err);
  process.exit(1);
});
