"use client";

import { useState } from "react";
import { createDefaultFeedbackDraft } from "@/features/ingest/components/ingestJobs/mappers";
import type { FeedbackDraft, SplitDraftData } from "@/features/ingest/components/ingestJobs/types";
import { FeedbackResponseViewer } from "./FeedbackResponseViewer";

type SplitDraftChapter = SplitDraftData["chapters"][number];

type StrategyFeedbackFormProps = {
  chapter: SplitDraftChapter;
  draft: FeedbackDraft;
  tokenKeys: string[];
  taxonomyVersion: string;
  rulePackVersion: string;
  feedbackBusy: boolean;
  onUpdateFeedbackDraft: (taskId: number, patch: Partial<FeedbackDraft>) => void;
  onSubmitSplitFeedback: (chapter: SplitDraftChapter) => void;
  onReprocessChapter: (chapter: SplitDraftChapter) => void;
  onApproveChapter: (chapterTaskId: number, chapterScenes: SplitDraftData["chapters"][number]["scenes"]) => void;
  splitActing: boolean;
  isMature?: boolean;
};




function FeedbackHelpGuide() {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-1">
      <button
        type="button"
        className="shell-link text-[10px] opacity-70"
        onClick={() => setOpen(!open)}
      >
        {open ? "Hide Examples" : "Show Examples"}
      </button>

      {open && (
        <div className="mt-2 grid gap-4 border-l border-[#2A3441] pl-3 py-1 text-[11px] leading-relaxed text-slate-400">
          <div>
            <div className="font-bold text-slate-300 uppercase tracking-tight text-[10px] mb-1">3 Feedback Types</div>
            <ul className="grid gap-2">
              <li>
                <span className="text-slate-200 font-medium">Not Helpful / Error:</span> Fixes a specific mistake.
                <div className="mt-0.5 opacity-80 italic">e.g., Not Helpful: Fragmentation in Scene 2.</div>
              </li>
              <li>
                <span className="text-slate-200 font-medium">Helpful:</span> Maintains a positive pattern.
                <div className="mt-0.5 opacity-80 italic">e.g., Helpful: Proper POV Shift in Scene 5.</div>
              </li>
              <li>
                <span className="text-slate-200 font-medium">Approve / Excellent:</span> Reached desired level of quality.
                <div className="mt-0.5 opacity-80 italic">e.g., EXCELLENT. System is mature.</div>
              </li>
            </ul>
          </div>

          <div>
            <div className="font-bold text-slate-300 uppercase tracking-tight text-[10px] mb-1">2 Usage Styles</div>
            <ul className="grid gap-2">
              <li>
                <span className="text-slate-200 font-medium">Mixed Signal (Improvement):</span>
                <div className="mt-0.5 opacity-80 italic">e.g., Not Helpful: Error CONJUNCTION_HEAD in Scene 4. Helpful: Dialogue Integrity in Scene 1.</div>
              </li>
              <li>
                <span className="text-slate-200 font-medium">Finality (Approval):</span>
                <div className="mt-0.5 opacity-80 italic">e.g., EXCELLENT. All rules met: No conjunction heads, perfect POV shifts.</div>
              </li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

function FeedbackBoundaryInputs({
  chapter,
  draft,
  onUpdateFeedbackDraft,
}: {
  chapter: SplitDraftChapter;
  draft: FeedbackDraft;
  onUpdateFeedbackDraft: (taskId: number, patch: Partial<FeedbackDraft>) => void;
}) {
  return (
    <div className="grid gap-2 md:grid-cols-3">
      <label className="grid gap-1 text-xs">
        <span className="text-slate-200">Boundary left scene idx</span>
        <input
          type="number"
          min={1}
          className="shell-control px-2 py-1 text-xs"
          value={draft.sceneIdxLeft ?? ""}
          onChange={(e) =>
            onUpdateFeedbackDraft(chapter.task_id, {
              sceneIdxLeft: e.target.value ? Number(e.target.value) : null,
            })
          }
          placeholder="e.g. 3"
        />
      </label>
      <label className="grid gap-1 text-xs">
        <span className="text-slate-200">Boundary right scene idx</span>
        <input
          type="number"
          min={1}
          className="shell-control px-2 py-1 text-xs"
          value={draft.sceneIdxRight ?? ""}
          onChange={(e) =>
            onUpdateFeedbackDraft(chapter.task_id, {
              sceneIdxRight: e.target.value ? Number(e.target.value) : null,
            })
          }
          placeholder="e.g. 4"
        />
      </label>
      <label className="grid gap-1 text-xs">
        <span className="text-slate-200">Boundary char offset</span>
        <input
          type="number"
          min={0}
          className="shell-control px-2 py-1 text-xs"
          value={draft.charOffset ?? ""}
          onChange={(e) =>
            onUpdateFeedbackDraft(chapter.task_id, {
              charOffset: e.target.value ? Number(e.target.value) : null,
            })
          }
          placeholder="e.g. 8503"
        />
      </label>
    </div>
  );
}



function FeedbackNoteActions({
  chapter,
  draft,
  tokenKeys,
  taxonomyVersion,
  rulePackVersion,
  feedbackBusy,
  onUpdateFeedbackDraft,
  onSubmitSplitFeedback,
  onReprocessChapter,
  onApproveChapter,
  splitActing,
  isMature,
}: {
  chapter: SplitDraftChapter;
  draft: FeedbackDraft;
  tokenKeys: string[];
  taxonomyVersion: string;
  rulePackVersion: string;
  feedbackBusy: boolean;
  onUpdateFeedbackDraft: (taskId: number, patch: Partial<FeedbackDraft>) => void;
  onSubmitSplitFeedback: (chapter: SplitDraftChapter) => void;
  onReprocessChapter: (chapter: SplitDraftChapter) => void;
  onApproveChapter: (chapterTaskId: number, chapterScenes: SplitDraftData["chapters"][number]["scenes"]) => void;
  splitActing: boolean;
  isMature?: boolean;
}) {
  return (
    <>
      <div className="grid gap-2 md:grid-cols-3">
        <label className="grid gap-1 text-xs">
          <span className="text-slate-200">Token (taxonomy)</span>
          <select
            className="shell-control px-2 py-1 text-xs"
            value={draft.tokenKey}
            onChange={(e) => onUpdateFeedbackDraft(chapter.task_id, { tokenKey: e.target.value })}
          >
            {tokenKeys.map((token) => (
              <option key={token} value={token}>
                {token}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs md:col-span-2">
          <span className="text-slate-200">Scene / line reference</span>
          <input
            type="text"
            className="shell-control px-2 py-1 text-xs"
            value={draft.locationRef}
            onChange={(e) => onUpdateFeedbackDraft(chapter.task_id, { locationRef: e.target.value })}
            placeholder="e.g. Scene 3, line 42"
          />
        </label>
      </div>
      <label className="grid gap-1 text-xs">
        <span className="text-slate-200">Reason (free text)</span>
        <textarea
          className="shell-control min-h-[92px] px-2 py-1 text-xs"
          value={draft.note}
          onChange={(e) => onUpdateFeedbackDraft(chapter.task_id, { note: e.target.value })}
          placeholder='e.g., "World-building mixed with action causes pacing drop."'
        />
      </label>
      <div className="muted text-[11px]">
        Template: <code>[TOKEN] + [Scene/Line] + [Reason]</code> | active pair: {taxonomyVersion}/{rulePackVersion}
      </div>

      <FeedbackHelpGuide />

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="shell-link px-2 py-1 text-xs" onClick={() => onSubmitSplitFeedback(chapter)} disabled={feedbackBusy || splitActing}>
          Submit Feedback
        </button>
        {!isMature && (
          <button type="button" className="shell-link px-2 py-1 text-xs text-amber-300 border-amber-900/50 hover:bg-amber-950/30" onClick={() => onReprocessChapter(chapter)} disabled={feedbackBusy || splitActing}>
            Reprocess (Fail)
          </button>
        )}
        <button type="button" className="shell-link px-2 py-1 text-xs text-emerald-300 border-emerald-900/50 hover:bg-emerald-950/30" onClick={() => onApproveChapter(chapter.task_id, chapter.scenes)} disabled={feedbackBusy || splitActing || chapter.scenes.length === 0}>
          Approve (Success)
        </button>
        <button
          type="button"
          className="shell-link px-2 py-1 text-xs opacity-70"
          onClick={() => onUpdateFeedbackDraft(chapter.task_id, createDefaultFeedbackDraft())}
          disabled={feedbackBusy || splitActing}
        >
          Reset
        </button>
        {feedbackBusy && <span className="muted">loading...</span>}
      </div>
    </>
  );
}

export function StrategyFeedbackForm({
  chapter,
  draft,
  tokenKeys,
  taxonomyVersion,
  rulePackVersion,
  feedbackBusy,
  onUpdateFeedbackDraft,
  onSubmitSplitFeedback,
  onReprocessChapter,
  onApproveChapter,
  splitActing,
  isMature,
}: StrategyFeedbackFormProps) {
  return (
    <div className="mt-1 grid gap-2 rounded border border-[#223247] bg-[#0f172a] p-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="text-xs font-medium text-slate-200">Strategy Feedback</div>
          {isMature && (
            <span className="rounded bg-indigo-500/20 px-1.5 py-0.5 text-[10px] font-bold text-indigo-400 border border-indigo-500/30">
              PRODUCTION MODE
            </span>
          )}
        </div>
        <button
          type="button"
          className="shell-link px-2 py-1 text-xs"
          onClick={() => onUpdateFeedbackDraft(chapter.task_id, { open: !draft.open })}
        >
          {draft.open ? "Hide form" : "Open form"}
        </button>
      </div>
      {draft.open && (
        <>
          <FeedbackBoundaryInputs chapter={chapter} draft={draft} onUpdateFeedbackDraft={onUpdateFeedbackDraft} />
          {(draft.aiResponse || feedbackBusy) && (
            <FeedbackResponseViewer
              draft={draft}
              loading={feedbackBusy}
              onClearResponse={() => onUpdateFeedbackDraft(chapter.task_id, { aiResponse: null })}
            />
          )}
          <FeedbackNoteActions
            chapter={chapter}
            draft={draft}
            tokenKeys={tokenKeys}
            taxonomyVersion={taxonomyVersion}
            rulePackVersion={rulePackVersion}
            feedbackBusy={feedbackBusy}
            onUpdateFeedbackDraft={onUpdateFeedbackDraft}
            onSubmitSplitFeedback={onSubmitSplitFeedback}
            onReprocessChapter={onReprocessChapter}
            onApproveChapter={onApproveChapter}
            splitActing={splitActing}
            isMature={isMature}
          />
        </>
      )}
    </div>
  );
}
