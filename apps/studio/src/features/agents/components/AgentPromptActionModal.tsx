/* eslint-disable max-lines-per-function */

import { PROMOTION_REASON_TEMPLATES } from "../shared/agentGovernanceConstants";
import type { AgentGovernancePanelModel } from "../hooks/useAgentGovernancePanel";

type Props = { vm: AgentGovernancePanelModel };

export function AgentPromptActionModal({ vm }: Props) {
  const {
    actionModal,
    rollbackTargetVersion,
    setRollbackTargetVersion,
    promoteAuthor,
    setPromoteAuthor,
    promoteApprovedBy,
    setPromoteApprovedBy,
    promoteReasonTemplate,
    setPromoteReasonTemplate,
    promoteLookbackHours,
    setPromoteLookbackHours,
    promoteMinSamples,
    setPromoteMinSamples,
    actionReason,
    setActionReason,
    closeActionModal,
    submitActionModal,
    actionBusy,
  } = vm;

  return actionModal ? (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-lg rounded border border-white/15 bg-[#0f141b] p-4">
        <div className="mb-3 text-sm font-semibold text-slate-100">
          {actionModal.mode === "archive"
            ? "Archive Prompt Version"
            : actionModal.mode === "rollback"
              ? "Rollback Prompt Version"
              : "Promote Active (Approval Required)"}
        </div>
        <div className="mb-2 text-xs text-slate-400">version: {actionModal.versionId}</div>
        {actionModal.mode === "rollback" ? (
          <div className="mb-3">
            <label className="mb-1 block text-xs text-slate-300">Target Version ID</label>
            <input
              type="number"
              className="shell-control w-full px-2 py-1 text-sm"
              value={rollbackTargetVersion}
              onChange={(e) => setRollbackTargetVersion(e.target.value ? Number(e.target.value) : "")}
              placeholder="e.g. 101"
            />
          </div>
        ) : null}
        {actionModal.mode === "promote_active" ? (
          <>
            <div className="mb-3 grid grid-cols-1 gap-2 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs text-slate-300">Author</label>
                <input
                  className="shell-control w-full px-2 py-1 text-sm"
                  value={promoteAuthor}
                  onChange={(e) => setPromoteAuthor(e.target.value)}
                  placeholder="studio"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-300">Approved By</label>
                <input
                  className="shell-control w-full px-2 py-1 text-sm"
                  value={promoteApprovedBy}
                  onChange={(e) => setPromoteApprovedBy(e.target.value)}
                  placeholder="reviewer id"
                />
              </div>
            </div>
            <div className="mb-3 grid grid-cols-1 gap-2 md:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs text-slate-300">Reason Template</label>
                <select
                  className="shell-control w-full px-2 py-1 text-sm"
                  value={promoteReasonTemplate}
                  onChange={(e) => setPromoteReasonTemplate(e.target.value as (typeof PROMOTION_REASON_TEMPLATES)[number])}
                >
                  {PROMOTION_REASON_TEMPLATES.map((x) => (
                    <option key={x} value={x}>
                      {x}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-300">Lookback Hours</label>
                <input
                  type="number"
                  className="shell-control w-full px-2 py-1 text-sm"
                  value={promoteLookbackHours}
                  onChange={(e) => setPromoteLookbackHours(e.target.value ? Number(e.target.value) : "")}
                  min={1}
                  max={720}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-300">Min Samples</label>
                <input
                  type="number"
                  className="shell-control w-full px-2 py-1 text-sm"
                  value={promoteMinSamples}
                  onChange={(e) => setPromoteMinSamples(e.target.value ? Number(e.target.value) : "")}
                  min={1}
                  max={10000}
                />
              </div>
            </div>
          </>
        ) : null}
        <div className="mb-3">
          <label className="mb-1 block text-xs text-slate-300">Reason (required)</label>
          <textarea
            className="shell-control min-h-[90px] w-full px-2 py-1 text-sm"
            value={actionReason}
            onChange={(e) => setActionReason(e.target.value)}
            placeholder="Explain why this archive/rollback is required..."
          />
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="shell-link px-3 py-2 text-xs" onClick={closeActionModal} disabled={actionBusy}>
            Cancel
          </button>
          <button type="button" className="shell-link px-3 py-2 text-xs" onClick={() => void submitActionModal()} disabled={actionBusy}>
            {actionBusy ? "Submitting..." : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  ) : null;
}
