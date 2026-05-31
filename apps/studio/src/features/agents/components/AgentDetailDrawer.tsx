
/* eslint-disable max-lines-per-function, complexity */
import Link from "next/link";

import { readChunkPromptTrace } from "../shared/agentGovernanceUtils";
import type { AgentDrawerTab } from "../shared/types";
import type { AgentGovernancePanelModel } from "../hooks/useAgentGovernancePanel";

type Props = { vm: AgentGovernancePanelModel };

export function AgentDetailDrawer({ vm }: Props) {
  const {
    drawerData,
    drawerTab,
    setDrawerTab,
    storySlug,
    onPromoteCanary,
    openPromoteActiveModal,
    quickRollbackCandidate,
    openRollbackModal,
    setRollbackTargetVersion,
  } = vm;

  return (
      <div className="surface-card p-3">
        <div className="mb-2 text-xs uppercase tracking-wide text-slate-400">Agent Detail Drawer</div>
        <div className="mb-3 flex flex-wrap gap-2">
          {([
            ["overview", "Overview"],
            ["prompt", "Prompt"],
            ["memory", "Memory"],
            ["feedback", "Feedback"],
            ["config", "Config"],
          ] as Array<[AgentDrawerTab, string]>).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`shell-link px-2 py-1 text-xs ${drawerTab === id ? "border-[#9de5dc]/40 text-[#9de5dc]" : ""}`}
              onClick={() => setDrawerTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
        {!drawerData ? (
          <div className="muted text-xs">No drawer data.</div>
        ) : (
          <div className="text-xs">
            {drawerTab === "overview" ? (
              <div className="space-y-2">
                <div>Prompt active: <span className="text-slate-200">{drawerData.prompt_summary.active?.version_id ?? "-"}</span></div>
                <div>Prompt canary: <span className="text-slate-200">{drawerData.prompt_summary.canary?.version_id ?? "-"}</span></div>
                <div>Model: <span className="text-slate-200">{drawerData.config_snapshot.model_name ?? "-"}</span></div>
                <div>Latest run: <span className="text-slate-200">{drawerData.runtime_summary.latest_run ? `#${drawerData.runtime_summary.latest_run.id}` : "-"}</span></div>
                {drawerData.ops_meta ? (
                  <div className="rounded border border-[#2A3441] bg-slate-900/40 p-2 text-[11px]">
                    <div>Strategy: <span className="text-slate-200">{drawerData.ops_meta.strategy_selected ?? "-"}</span></div>
                    <div>Learning mode: <span className="text-slate-200">{drawerData.ops_meta.learning_mode ?? "-"}</span></div>
                    <div>Learning applied: <span className="text-slate-200">{String(Boolean(drawerData.ops_meta.learning_applied))}</span></div>
                    <div>Decay: <span className="text-slate-200">{drawerData.ops_meta.profile_decay_factor ?? "-"}</span></div>
                    <div>Reset scope: <span className="text-slate-200">{drawerData.ops_meta.profile_reset_scope ?? "-"}</span></div>
                    <div>Truth conflicts: <span className="text-slate-200">{drawerData.ops_meta.truth_conflicts?.length ?? 0}</span></div>
                    <div>Shadow pairs: <span className="text-slate-200">{drawerData.ops_meta.shadow_pairs?.length ?? 0}</span></div>
                    {(drawerData.ops_meta.shadow_compare?.length ?? 0) > 0 ? (
                      <div className="mt-1 max-h-28 overflow-auto rounded border border-[#2A3441] p-1 text-[11px]">
                        {drawerData.ops_meta.shadow_compare?.slice(0, 3).map((s) => (
                          <div key={s.pair_id} className="mb-1 border-b border-[#2A3441] pb-1 last:mb-0 last:border-b-0 last:pb-0">
                            <div className="text-slate-200">pair #{s.pair_id} ({s.pair_status})</div>
                            <div className="text-slate-400">
                              latency delta: {s.delta_latency_ms ?? "-"} ms | token in: {s.delta_token_in ?? "-"} | token out: {s.delta_token_out ?? "-"}
                            </div>
                            {s.compare_json && typeof s.compare_json === "object" ? (
                              <div className="text-slate-400">
                                no-write: {String((s.compare_json as Record<string, unknown>).no_write_invariant_ok ?? "-")}
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
            {drawerTab === "prompt" ? (
              <div className="space-y-2">
                <div>Active version: <span className="text-slate-200">{drawerData.prompt_summary.active?.version_id ?? "-"}</span></div>
                <div>Canary version: <span className="text-slate-200">{drawerData.prompt_summary.canary?.version_id ?? "-"}</span></div>
                {drawerData.prompt_summary.hydration_latest ? (
                  <div className="rounded border border-cyan-300/20 bg-cyan-900/10 p-2">
                    <div className="mb-1 text-[11px] uppercase tracking-wide text-cyan-200">Hydrated Prompt (Latest Run)</div>
                    <div className="grid gap-1 text-[11px] text-slate-300">
                      <div>Run trace: <span className="text-slate-100">{drawerData.prompt_summary.hydration_latest.run_trace_id ?? "-"}</span></div>
                      <div>Task type: <span className="text-slate-100">{drawerData.prompt_summary.hydration_latest.task_type || "-"}</span></div>
                      <div>Prompt version: <span className="text-slate-100">{drawerData.prompt_summary.hydration_latest.prompt_version_id ?? "-"}</span></div>
                      <div>Hash: <span className="text-slate-100">{drawerData.prompt_summary.hydration_latest.hydration_output_hash ?? "-"}</span></div>
                      <div>
                        Token est: base {drawerData.prompt_summary.hydration_latest.tokens_prompt_base ?? 0}
                        {" | "}rules {drawerData.prompt_summary.hydration_latest.tokens_rules_injected ?? 0}
                        {" | "}memory {drawerData.prompt_summary.hydration_latest.tokens_memory_injected ?? 0}
                        {" | "}feedback {drawerData.prompt_summary.hydration_latest.tokens_feedback_injected ?? 0}
                      </div>
                    </div>
                    {(() => {
                      const chunks = readChunkPromptTrace(drawerData.prompt_summary.hydration_latest);
                      if (chunks.length === 0) return null;
                      return (
                        <div className="mt-2 rounded border border-cyan-300/20 bg-slate-950/70 p-2">
                          <div className="mb-1 text-[11px] uppercase tracking-wide text-cyan-200">
                            Chunk Prompt Trace ({chunks.length})
                          </div>
                          <div className="max-h-44 space-y-1 overflow-auto text-[11px]">
                            {chunks.slice(0, 8).map((c, idx) => (
                              <div key={idx} className="rounded border border-[#2A3441] bg-slate-900/50 p-1">
                                <div className="text-slate-200">
                                  chunk #{String(c.chunk_index ?? idx)} @ {String(c.chunk_start ?? "-")} | chars {String(c.chunk_chars ?? "-")}
                                </div>
                                <div className="break-all text-slate-400">sys: {String(c.system_prompt_sha256 ?? "-")}</div>
                                <div className="break-all text-slate-400">usr: {String(c.user_prompt_sha256 ?? "-")}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                    {drawerData.prompt_summary.hydration_latest.hydration_output_text ? (
                      <pre className="mt-2 max-h-52 overflow-auto whitespace-pre-wrap rounded border border-cyan-300/20 bg-slate-950/70 p-2 text-[11px] leading-relaxed text-slate-200">
                        {drawerData.prompt_summary.hydration_latest.hydration_output_text}
                      </pre>
                    ) : (
                      <div className="mt-2 text-[11px] text-slate-400">Hydrated prompt text storage is disabled.</div>
                    )}
                  </div>
                ) : (
                  <div className="text-[11px] text-slate-400">No hydrated prompt trace yet for this agent.</div>
                )}
                {drawerData.prompt_summary.hydration_recent && drawerData.prompt_summary.hydration_recent.length > 0 ? (
                  <div className="rounded border border-[#2A3441] p-2">
                    <div className="mb-1 text-[11px] uppercase tracking-wide text-slate-400">Hydration History</div>
                    <div className="space-y-1">
                      {drawerData.prompt_summary.hydration_recent.slice(0, 6).map((h) => (
                        <div key={h.id} className="flex items-center justify-between gap-2 rounded border border-[#2A3441] bg-slate-900/40 px-2 py-1 text-[11px]">
                          <div className="min-w-0">
                            <div className="truncate text-slate-200">
                              {h.task_type} | v{h.prompt_version_id ?? "-"} | #{h.run_trace_id ?? "-"}
                            </div>
                            <div className="truncate text-slate-400">{new Date(h.created_at).toLocaleString()}</div>
                          </div>
                          {typeof h.run_trace_id === "number" ? (
                            <Link
                              href={`/stories/${encodeURIComponent(storySlug)}/agents?tab=runs&run_id=${String(h.run_trace_id)}`}
                              className="shell-link px-2 py-1 text-[11px]"
                            >
                              Open
                            </Link>
                          ) : (
                            <span className="text-slate-500">-</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
                {drawerData.prompt_summary.active ? (
                  <div className="rounded border border-[#2A3441] p-2">
                    <div className="mb-1 text-[11px] uppercase tracking-wide text-slate-400">Active System Prompt</div>
                    <pre className="max-h-36 overflow-auto whitespace-pre-wrap text-[11px] leading-relaxed text-slate-200">
                      {drawerData.prompt_summary.active.system_prompt}
                    </pre>
                    {drawerData.prompt_summary.active.developer_prompt ? (
                      <>
                        <div className="mb-1 mt-2 text-[11px] uppercase tracking-wide text-slate-400">Active Developer Prompt</div>
                        <pre className="max-h-28 overflow-auto whitespace-pre-wrap text-[11px] leading-relaxed text-slate-300">
                          {drawerData.prompt_summary.active.developer_prompt}
                        </pre>
                      </>
                    ) : null}
                  </div>
                ) : null}
                {drawerData.prompt_summary.canary ? (
                  <div className="rounded border border-[#2A3441] p-2">
                    <div className="mb-1 text-[11px] uppercase tracking-wide text-slate-400">Canary System Prompt</div>
                    <pre className="max-h-28 overflow-auto whitespace-pre-wrap text-[11px] leading-relaxed text-slate-200">
                      {drawerData.prompt_summary.canary.system_prompt}
                    </pre>
                  </div>
                ) : null}
                <Link href={`/stories/${encodeURIComponent(storySlug)}/agents?tab=prompts`} className="shell-link inline-block px-2 py-1 text-xs">
                  Open Prompt Registry
                </Link>
                <div className="flex flex-wrap gap-2 pt-1">
                  {drawerData.prompt_summary.canary ? (
                    <button
                      type="button"
                      className="shell-link px-2 py-1 text-xs"
                      onClick={() => void onPromoteCanary(drawerData.prompt_summary.canary!.version_id)}
                    >
                      Promote Canary (10%)
                    </button>
                  ) : null}
                  {drawerData.prompt_summary.canary ? (
                    <button
                      type="button"
                      className="shell-link px-2 py-1 text-xs"
                      onClick={() => openPromoteActiveModal(drawerData.prompt_summary.canary!.version_id)}
                    >
                      Promote To Active
                    </button>
                  ) : null}
                  {drawerData.prompt_summary.active && quickRollbackCandidate ? (
                    <button
                      type="button"
                      className="shell-link px-2 py-1 text-xs"
                      onClick={() => {
                        openRollbackModal(drawerData.prompt_summary.active!.version_id);
                        setRollbackTargetVersion(quickRollbackCandidate.version_id);
                      }}
                    >
                      Quick Rollback
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}
            {drawerTab === "memory" ? (
              <div className="space-y-2">
                {drawerData.memory_summary.items.length === 0 ? <div className="muted">No memory shards.</div> : null}
                {drawerData.memory_summary.items.slice(0, 4).map((m) => (
                  <div key={m.id} className="rounded border border-[#2A3441] p-2">
                    <div className="text-slate-200">{m.memory_type} | score {m.score}</div>
                    <div className="muted line-clamp-2">{m.memory_text}</div>
                  </div>
                ))}
                <Link href={`/stories/${encodeURIComponent(storySlug)}/agents?tab=memory`} className="shell-link inline-block px-2 py-1 text-xs">
                  Open Memory Bank
                </Link>
              </div>
            ) : null}
            {drawerTab === "feedback" ? (
              <div className="space-y-2">
                {drawerData.feedback_summary.items.length === 0 ? <div className="muted">No feedback items.</div> : null}
                {drawerData.feedback_summary.items.slice(0, 4).map((f) => (
                  <div key={f.id} className="rounded border border-[#2A3441] p-2">
                    <div className="text-slate-200">{f.feedback_type} | {f.feedback_source}</div>
                    <div className="muted line-clamp-2">{f.feedback_text}</div>
                  </div>
                ))}
                <Link href={`/stories/${encodeURIComponent(storySlug)}/agents?tab=feedback`} className="shell-link inline-block px-2 py-1 text-xs">
                  Open Feedback Loop
                </Link>
              </div>
            ) : null}
            {drawerTab === "config" ? (
              <div className="space-y-2">
                <div>Model: <span className="text-slate-200">{drawerData.config_snapshot.model_name ?? "-"}</span></div>
                <div>Prompt version: <span className="text-slate-200">{drawerData.config_snapshot.prompt_version_id ?? "-"}</span></div>
                <div>Timeout: <span className="text-slate-200">{drawerData.config_snapshot.timeout_seconds ?? "-"}</span></div>
                <div>Retry budget: <span className="text-slate-200">{drawerData.config_snapshot.retry_budget ?? "-"}</span></div>
              </div>
            ) : null}
          </div>
        )}
      </div>
  );
}
