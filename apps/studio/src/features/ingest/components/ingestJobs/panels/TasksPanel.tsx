"use client";

import { asObject } from "@/features/ingest/components/ingestJobs/mappers";
import type { IngestTask } from "@/features/ingest/components/ingestJobs/types";

type TaskListProps = {
  tasks: IngestTask[];
  selectedTaskId: number | null;
  selectedJobId: number | null;
  acting: boolean;
  onSelectTask: (taskId: number) => void;
  onRetryTask: (taskId: number) => void;
};

type TaskDetailProps = {
  selectedTask: IngestTask | null;
};

type TasksPanelProps = TaskListProps & TaskDetailProps;

function TaskList({
  tasks,
  selectedTaskId,
  selectedJobId,
  acting,
  onSelectTask,
  onRetryTask,
}: TaskListProps) {
  return (
    <div className="divide-y">
      {tasks.map((task) => (
        <div
          key={task.id}
          className={`w-full cursor-pointer px-4 py-3 text-left text-sm ${selectedTaskId === task.id ? "bg-[#152232]" : ""}`}
          onClick={() => onSelectTask(task.id)}
        >
          <div className="font-medium">
            #{task.seq_no} | {task.unit_type} | {task.status}
          </div>
          <div className="muted">
            task: {task.task_type} | source: {task.source_path ?? "-"} | attempts: {task.attempts} | updated:{" "}
            {new Date(task.updated_at).toLocaleString()}
          </div>
          {(task.chapter_task_id || task.approved_scene_idx) && (
            <div className="muted text-xs">
              {task.chapter_task_id ? `chapter_task: ${task.chapter_task_id}` : ""}
              {task.chapter_task_id && task.approved_scene_idx ? " | " : ""}
              {task.approved_scene_idx ? `scene_idx: ${task.approved_scene_idx}` : ""}
            </div>
          )}
          {task.error && <div className="text-[#ff8f8f]">error: {task.error}</div>}
          {task.status === "FAILED" && (
            <div className="mt-1">
              <button type="button" className="shell-link px-2 py-1 text-xs" onClick={() => onRetryTask(task.id)} disabled={acting}>
                Retry Task
              </button>
            </div>
          )}
        </div>
      ))}
      {selectedJobId && tasks.length === 0 && <div className="muted px-4 py-4 text-sm">No tasks.</div>}
      {!selectedJobId && <div className="muted px-4 py-4 text-sm">Select a job to view tasks.</div>}
    </div>
  );
}

function TaskDetail({ selectedTask }: TaskDetailProps) {
  if (!selectedTask) return null;

  return (
    <div className="border-t border-[#223247] p-4 text-sm">
      <div className="mb-2 font-medium">Task Detail #{selectedTask.seq_no} ({selectedTask.task_type})</div>
      {selectedTask.task_type === "CHAPTER_SPLIT_LLM" ? (
        (() => {
          const result = asObject(selectedTask.result_json);
          const scenes = Array.isArray(result.scenes) ? result.scenes : [];
          const chapterTitle =
            typeof result.chapter_title === "string" && result.chapter_title.trim()
              ? result.chapter_title
              : typeof result.chapter_id === "string"
                ? result.chapter_id
                : selectedTask.source_path ?? "-";
          return (
            <div className="grid gap-2">
              <div className="muted text-xs">
                chapter: {chapterTitle} | split_mode: {String(result.split_mode ?? "-")} | scenes: {scenes.length}
              </div>
              {Boolean(result.split_controls && typeof result.split_controls === "object") && (
                <div className="muted text-xs">
                  controls: self_healing={String((result.split_controls as Record<string, unknown>).self_healing_enabled ?? true)} | auto_retry=
                  {String((result.split_controls as Record<string, unknown>).auto_retry_enabled ?? true)} | max_llm_calls=
                  {String((result.split_controls as Record<string, unknown>).max_llm_calls ?? "-")}
                </div>
              )}
              {scenes.slice(0, 8).map((scene, idx) => {
                const row = asObject(scene);
                const start = Number(row.start) || 0;
                const end = Number(row.end) || 0;
                return (
                  <div key={`${idx}-${start}-${end}`} className="rounded border border-[#223247] bg-[#0f172a] px-2 py-1 text-xs">
                    #{Number(row.idx) || idx + 1} [{start}-{end}] {typeof row.title === "string" ? row.title : ""}
                  </div>
                );
              })}
            </div>
          );
        })()
      ) : selectedTask.task_type === "SCENE_CREATE" ? (
        (() => {
          const payload = asObject(selectedTask.payload_json);
          const approved = asObject(payload.approved_scene);
          const created = asObject(selectedTask.result_json);
          return (
            <div className="grid gap-1 text-xs">
              <div className="muted">
                chapter_task: {String(payload.chapter_task_id ?? "-")} | chapter: {String(payload.chapter_id ?? "-")}
              </div>
              <div>
                scene idx: {String(approved.idx ?? "-")} | range: {String(approved.start ?? "-")} - {String(approved.end ?? "-")} | title:{" "}
                {String(approved.title ?? "-")}
              </div>
              {Object.keys(created).length > 0 && (
                <div className="muted">
                  created scene_id: {String(created.scene_id ?? "-")} | version_id: {String(created.scene_version_id ?? "-")}
                </div>
              )}
            </div>
          );
        })()
      ) : (
        <div className="muted text-xs">No specialized preview for this task type.</div>
      )}
      <details className="mt-3">
        <summary className="cursor-pointer text-xs muted">Raw payload/result JSON</summary>
        <div className="mt-2 grid gap-2">
          <pre className="max-h-40 overflow-auto rounded border border-[#223247] bg-[#0f172a] p-2 text-[11px]">
            {JSON.stringify(selectedTask.payload_json ?? {}, null, 2)}
          </pre>
          <pre className="max-h-40 overflow-auto rounded border border-[#223247] bg-[#0f172a] p-2 text-[11px]">
            {JSON.stringify(selectedTask.result_json ?? {}, null, 2)}
          </pre>
        </div>
      </details>
    </div>
  );
}

export function TasksPanel({
  tasks,
  selectedTaskId,
  selectedTask,
  selectedJobId,
  acting,
  onSelectTask,
  onRetryTask,
}: TasksPanelProps) {
  return (
    <section className="surface-card">
      <div className="border-b border-[#223247] px-4 py-3 text-sm font-medium">
        Tasks {selectedJobId ? `(job #${selectedJobId})` : ""}
      </div>
      <TaskList
        tasks={tasks}
        selectedTaskId={selectedTaskId}
        selectedJobId={selectedJobId}
        acting={acting}
        onSelectTask={onSelectTask}
        onRetryTask={onRetryTask}
      />
      <TaskDetail selectedTask={selectedTask} />
    </section>
  );
}
