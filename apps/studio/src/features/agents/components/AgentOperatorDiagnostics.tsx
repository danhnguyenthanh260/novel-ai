
/* eslint-disable max-lines-per-function */
import { pct } from "../shared/agentGovernanceUtils";
import type { AgentGovernancePanelModel } from "../hooks/useAgentGovernancePanel";

type Props = { vm: AgentGovernancePanelModel };

export function AgentOperatorDiagnostics({ vm }: Props) {
  const {
    errorTaxonomy,
    coverageItems,
    alerts,
    shadowPairStatusFilter,
    setShadowPairStatusFilter,
    shadowSort,
    setShadowSort,
    shadowCompareView,
    promptImpact,
    metrics,
    tuningEvents,
  } = vm;

  return (
    <>
  <section className="surface-card p-3">
    <div className="mb-2 text-sm font-medium text-slate-200">Error Taxonomy</div>
    <div className="overflow-x-auto">
      <table className="w-full min-w-[980px] text-left text-sm">
        <thead className="text-xs text-slate-400">
          <tr>
            <th className="px-2 py-1">Category</th>
            <th className="px-2 py-1">Hits</th>
            <th className="px-2 py-1">Hit Rate</th>
            <th className="px-2 py-1">Top Agents</th>
          </tr>
        </thead>
        <tbody>
          {errorTaxonomy.map((x) => (
            <tr key={x.taxonomy} className="border-t border-[#2A3441]">
              <td className="px-2 py-2">{x.taxonomy}</td>
              <td className="px-2 py-2">{x.hit_count}</td>
              <td className="px-2 py-2">{pct(x.hit_rate)}</td>
              <td className="px-2 py-2">
                {x.top_agents.length
                  ? x.top_agents.map((a) => `${a.agent_name} (${a.hit_count})`).join(", ")
                  : "-"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </section>

  <section className="surface-card p-3">
    <div className="mb-2 text-sm font-medium text-slate-200">Coverage Health</div>
    <div className="overflow-x-auto">
      <table className="w-full min-w-[840px] text-left text-sm">
        <thead className="text-xs text-slate-400">
          <tr>
            <th className="px-2 py-1">Agent</th>
            <th className="px-2 py-1">Expected</th>
            <th className="px-2 py-1">Traced</th>
            <th className="px-2 py-1">Coverage</th>
            <th className="px-2 py-1">Status</th>
          </tr>
        </thead>
        <tbody>
          {coverageItems.map((c) => (
            <tr key={c.agent_name} className="border-t border-[#2A3441]">
              <td className="px-2 py-2">{c.agent_name}</td>
              <td className="px-2 py-2">{c.expected_count}</td>
              <td className="px-2 py-2">{c.traced_count}</td>
              <td className="px-2 py-2">{(c.coverage_rate * 100).toFixed(1)}%</td>
              <td className={`px-2 py-2 ${c.below_threshold ? "text-[#ff9f9f]" : "text-[#9de5dc]"}`}>
                {c.below_threshold ? "ALERT" : "OK"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </section>

  <section className="surface-card p-3">
    <div className="mb-2 text-sm font-medium text-slate-200">Alert Feed</div>
    <div className="overflow-x-auto">
      <table className="w-full min-w-[980px] text-left text-sm">
        <thead className="text-xs text-slate-400">
          <tr>
            <th className="px-2 py-1">Severity</th>
            <th className="px-2 py-1">Type</th>
            <th className="px-2 py-1">Agent</th>
            <th className="px-2 py-1">Metric</th>
            <th className="px-2 py-1">Value</th>
            <th className="px-2 py-1">Threshold</th>
            <th className="px-2 py-1">Message</th>
          </tr>
        </thead>
        <tbody>
          {alerts.map((a, idx) => (
            <tr key={`${a.alert_type}-${a.agent_name || "all"}-${idx}`} className="border-t border-[#2A3441]">
              <td className={`px-2 py-2 ${a.severity === "CRITICAL" ? "text-[#ff8f8f]" : a.severity === "WARN" ? "text-[#ffd58f]" : "text-slate-300"}`}>
                {a.severity}
              </td>
              <td className="px-2 py-2">{a.alert_type}</td>
              <td className="px-2 py-2">{a.agent_name || "-"}</td>
              <td className="px-2 py-2">{a.metric_name}</td>
              <td className="px-2 py-2">{a.metric_value}</td>
              <td className="px-2 py-2">{a.threshold}</td>
              <td className="px-2 py-2">{a.message}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </section>

  <section className="surface-card p-3">
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
      <div className="text-sm font-medium text-slate-200">Shadow Compare</div>
      <div className="flex items-center gap-2">
        <select
          className="shell-control px-2 py-1 text-xs"
          value={shadowPairStatusFilter}
          onChange={(e) => setShadowPairStatusFilter(e.target.value as "ALL" | "PLANNED" | "PAIRED" | "COMPARED" | "FAILED")}
        >
          <option value="ALL">All Status</option>
          <option value="PLANNED">PLANNED</option>
          <option value="PAIRED">PAIRED</option>
          <option value="COMPARED">COMPARED</option>
          <option value="FAILED">FAILED</option>
        </select>
        <select
          className="shell-control px-2 py-1 text-xs"
          value={shadowSort}
          onChange={(e) => setShadowSort(e.target.value as "latency_abs" | "latency" | "token_in" | "token_out" | "created")}
        >
          <option value="latency_abs">Sort: |Latency Delta|</option>
          <option value="latency">Sort: Latency Delta</option>
          <option value="token_in">Sort: Token In Delta</option>
          <option value="token_out">Sort: Token Out Delta</option>
          <option value="created">Sort: Latest</option>
        </select>
      </div>
    </div>
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1200px] text-left text-sm">
        <thead className="text-xs text-slate-400">
          <tr>
            <th className="px-2 py-1">Pair</th>
            <th className="px-2 py-1">Agent</th>
            <th className="px-2 py-1">Status</th>
            <th className="px-2 py-1">Active Run</th>
            <th className="px-2 py-1">Shadow Run</th>
            <th className="px-2 py-1">Prompt A/S</th>
            <th className="px-2 py-1">Latency Δ(ms)</th>
            <th className="px-2 py-1">Token In Δ</th>
            <th className="px-2 py-1">Token Out Δ</th>
            <th className="px-2 py-1">Hard Fail A/S</th>
            <th className="px-2 py-1">Flagged% A/S</th>
            <th className="px-2 py-1">Created</th>
          </tr>
        </thead>
        <tbody>
          {shadowCompareView.map((s) => (
            <tr key={s.id} className="border-t border-[#2A3441]">
              <td className="px-2 py-2">#{s.id}</td>
              <td className="px-2 py-2">{s.agent_name}</td>
              <td className="px-2 py-2">{s.pair_status}</td>
              <td className="px-2 py-2">{s.active_run_trace_id ?? "-"}</td>
              <td className="px-2 py-2">{s.shadow_run_trace_id ?? "-"}</td>
              <td className="px-2 py-2">{s.active_prompt_version_id ?? "-"} / {s.shadow_prompt_version_id ?? "-"}</td>
              <td className="px-2 py-2">{s.delta_latency_ms ?? "-"}</td>
              <td className="px-2 py-2">{s.delta_token_in ?? "-"}</td>
              <td className="px-2 py-2">{s.delta_token_out ?? "-"}</td>
              <td className="px-2 py-2">{String(s.active_hard_fail)} / {String(s.shadow_hard_fail)}</td>
              <td className="px-2 py-2">{s.active_flagged_pct ?? "-"} / {s.shadow_flagged_pct ?? "-"}</td>
              <td className="px-2 py-2">{new Date(s.created_at).toLocaleString()}</td>
            </tr>
          ))}
          {shadowCompareView.length === 0 ? (
            <tr>
              <td className="muted px-2 py-4 text-sm" colSpan={12}>
                No shadow compare rows for current filter.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  </section>

  <section className="surface-card p-3">
    <div className="mb-2 text-sm font-medium text-slate-200">Prompt Impact</div>
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1040px] text-left text-sm">
        <thead className="text-xs text-slate-400">
          <tr>
            <th className="px-2 py-1">Agent</th>
            <th className="px-2 py-1">Prompt Version</th>
            <th className="px-2 py-1">Runs</th>
            <th className="px-2 py-1">Success</th>
            <th className="px-2 py-1">Failure</th>
            <th className="px-2 py-1">Meta Leak</th>
            <th className="px-2 py-1">Avg Latency</th>
            <th className="px-2 py-1">p95 Latency</th>
          </tr>
        </thead>
        <tbody>
          {promptImpact.map((p, idx) => (
            <tr key={`${p.agent_name}-${p.prompt_version_id ?? "null"}-${idx}`} className="border-t border-[#2A3441]">
              <td className="px-2 py-2">{p.agent_name}</td>
              <td className="px-2 py-2">{p.prompt_version_id ?? "-"}</td>
              <td className="px-2 py-2">{p.total_runs}</td>
              <td className="px-2 py-2">{pct(p.success_rate)}</td>
              <td className="px-2 py-2">{pct(p.failure_rate)}</td>
              <td className="px-2 py-2">{pct(p.meta_leak_rate)}</td>
              <td className="px-2 py-2">{p.avg_latency_ms ?? "-"}</td>
              <td className="px-2 py-2">{p.p95_latency_ms ?? "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </section>

  <section className="surface-card p-3">
    <div className="mb-2 text-sm font-medium text-slate-200">Metrics</div>
    <div className="overflow-x-auto">
      <table className="w-full min-w-[920px] text-left text-sm">
        <thead className="text-xs text-slate-400">
          <tr>
            <th className="px-2 py-1">Agent</th>
            <th className="px-2 py-1">Total</th>
            <th className="px-2 py-1">Success</th>
            <th className="px-2 py-1">Fail</th>
            <th className="px-2 py-1">Timeout</th>
            <th className="px-2 py-1">Avg Latency</th>
            <th className="px-2 py-1">Meta Leak</th>
          </tr>
        </thead>
        <tbody>
          {metrics.map((m) => (
            <tr key={m.agent_name} className="border-t border-[#2A3441]">
              <td className="px-2 py-2">{m.agent_name}</td>
              <td className="px-2 py-2">{m.total_runs}</td>
              <td className="px-2 py-2">{pct(m.success_rate)}</td>
              <td className="px-2 py-2">{pct(m.failure_rate)}</td>
              <td className="px-2 py-2">{pct(m.timeout_rate)}</td>
              <td className="px-2 py-2">{m.avg_latency_ms ?? "-"}</td>
              <td className="px-2 py-2">{pct(m.meta_leak_rate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </section>

  <section className="surface-card p-3">
    <div className="mb-2 text-sm font-medium text-slate-200">Reason Audit (Tuning Events)</div>
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1060px] text-left text-sm">
        <thead className="text-xs text-slate-400">
          <tr>
            <th className="px-2 py-1">ID</th>
            <th className="px-2 py-1">Agent</th>
            <th className="px-2 py-1">Action</th>
            <th className="px-2 py-1">From</th>
            <th className="px-2 py-1">To</th>
            <th className="px-2 py-1">Reason</th>
            <th className="px-2 py-1">Author</th>
            <th className="px-2 py-1">Approved By</th>
            <th className="px-2 py-1">Created</th>
          </tr>
        </thead>
        <tbody>
          {tuningEvents.map((ev) => (
            <tr key={ev.id} className="border-t border-[#2A3441]">
              <td className="px-2 py-2 font-mono">{ev.id}</td>
              <td className="px-2 py-2">{ev.agent_name}</td>
              <td className="px-2 py-2">{ev.action}</td>
              <td className="px-2 py-2">{ev.from_version_id ?? "-"}</td>
              <td className="px-2 py-2">{ev.to_version_id}</td>
              <td className="px-2 py-2">{ev.reason}</td>
              <td className="px-2 py-2">{ev.author}</td>
              <td className="px-2 py-2">{ev.approved_by ?? "-"}</td>
              <td className="px-2 py-2">{new Date(ev.created_at).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </section>
    </>
  );
}
