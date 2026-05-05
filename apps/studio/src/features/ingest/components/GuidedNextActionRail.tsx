import Link from "next/link";
import type {
  PipelineOverviewAlert,
  PipelineOverviewHealth,
  PipelineOverviewJob,
  PipelineOverviewKpi,
} from "@/features/ingest/components/pipelineOverviewContract";

type NextAction = {
  label: string;
  href: string;
  body: string;
  tone: "blocked" | "active" | "ready";
};

type GuidedNextActionRailProps = {
  storySlug: string;
  jobs: PipelineOverviewJob[];
  alerts: PipelineOverviewAlert[];
  kpi: PipelineOverviewKpi | null;
  health: PipelineOverviewHealth | null;
};

function normalizeStatus(value: string): string {
  return String(value || "").trim().toUpperCase();
}

function firstJobByStatus(jobs: PipelineOverviewJob[], statuses: string[]): PipelineOverviewJob | null {
  const set = new Set(statuses);
  return jobs.find((job) => set.has(normalizeStatus(job.status))) ?? null;
}

function storyBase(storySlug: string): string {
  return `/stories/${encodeURIComponent(storySlug)}`;
}

function blockedAction(args: GuidedNextActionRailProps): NextAction | null {
  const alert = args.alerts[0];
  if (!alert) return null;
  const base = storyBase(args.storySlug);
  return {
    label: "Inspect blocked node",
    href: `${base}/pipelines/${alert.job_id}?node=${encodeURIComponent(alert.node_key)}`,
    body: alert.message,
    tone: "blocked",
  };
}

function reviewAction(args: GuidedNextActionRailProps): NextAction | null {
  const reviewJob = firstJobByStatus(args.jobs, ["AWAIT_APPROVAL", "SPLIT_DRAFT"]);
  if (!reviewJob) return null;
  return {
    label: "Review ingest output",
    href: `${storyBase(args.storySlug)}/ingest`,
    body: `Job #${reviewJob.id} is waiting for source or split approval before writing should continue.`,
    tone: "active",
  };
}

function runningAction(args: GuidedNextActionRailProps): NextAction | null {
  const runningJob = firstJobByStatus(args.jobs, ["RUNNING", "READY"]);
  const hasWorkerActivity = (args.health?.running_tasks ?? 0) > 0;
  const hasReadyBacklog = (args.health?.ready_backlog ?? 0) > 0;
  if (!runningJob && !hasWorkerActivity && !hasReadyBacklog) return null;
  const base = storyBase(args.storySlug);
  return {
    label: "Monitor pipeline",
    href: runningJob ? `${base}/pipelines/${runningJob.id}` : `${base}/pipelines`,
    body: "Pipeline work is active. Check node progress before moving to analysis or writing.",
    tone: "active",
  };
}

function analysisAction(args: GuidedNextActionRailProps): NextAction | null {
  if ((args.kpi?.done_jobs ?? 0) === 0) return null;
  return {
    label: "Continue to analysis",
    href: `${storyBase(args.storySlug)}/analysis`,
    body: "Ingest has completed at least once. Review analysis and memory before drafting the next chapter.",
    tone: "ready",
  };
}

function buildNextAction(args: GuidedNextActionRailProps): NextAction {
  const action = blockedAction(args) ?? reviewAction(args) ?? runningAction(args) ?? analysisAction(args);
  if (action) return action;
  return {
    label: "Add source material",
    href: `${storyBase(args.storySlug)}/ingest`,
    body: "Start by uploading or pasting source text so the pipeline has material to split, validate, and analyze.",
    tone: "ready",
  };
}

function stageClass(active: boolean): string {
  return active
    ? "border-[var(--accent)] bg-[#123331] text-[var(--text-primary)]"
    : "border-[#2A3441] bg-[#0d1524] text-[var(--text-secondary)]";
}

function hasAnyJob(kpi: PipelineOverviewKpi | null, jobs: PipelineOverviewJob[]): boolean {
  return (kpi?.total_jobs ?? jobs.length) > 0;
}

function hasDoneJob(kpi: PipelineOverviewKpi | null): boolean {
  return (kpi?.done_jobs ?? 0) > 0;
}

function hasReviewWork(kpi: PipelineOverviewKpi | null, jobs: PipelineOverviewJob[]): boolean {
  if ((kpi?.wait_review_jobs ?? 0) > 0) return true;
  return Boolean(firstJobByStatus(jobs, ["AWAIT_APPROVAL", "SPLIT_DRAFT"]));
}

function hasBlockedWork(kpi: PipelineOverviewKpi | null, alerts: PipelineOverviewAlert[]): boolean {
  if (alerts.length > 0) return true;
  return (kpi?.failed_jobs ?? 0) > 0;
}

function buildStages({ storySlug, jobs, alerts, kpi }: GuidedNextActionRailProps) {
  const base = storyBase(storySlug);
  const hasJobs = hasAnyJob(kpi, jobs);
  const hasDone = hasDoneJob(kpi);
  const hasReview = hasReviewWork(kpi, jobs);
  const hasBlocked = hasBlockedWork(kpi, alerts);
  return [
    { label: "Source", href: `${base}/ingest`, active: !hasJobs || hasReview },
    { label: "Pipeline", href: `${base}/pipelines`, active: hasJobs && !hasDone },
    { label: "Analysis", href: `${base}/analysis`, active: hasDone },
    { label: "Write", href: `${base}/write`, active: hasDone && !hasBlocked },
    { label: "Review", href: `${base}/reviews`, active: hasReview || hasDone },
  ];
}

function actionToneClass(tone: NextAction["tone"]): string {
  if (tone === "blocked") return "border-rose-700/50 bg-rose-950/30 text-rose-100";
  if (tone === "active") return "border-amber-700/50 bg-amber-950/30 text-amber-100";
  return "border-[#2f5b58] bg-[#123331] text-[#c9fff1]";
}

export default function GuidedNextActionRail(props: GuidedNextActionRailProps) {
  const action = buildNextAction(props);
  const stages = buildStages(props);

  return (
    <section className="surface-card grid gap-3 p-3 lg:grid-cols-[1fr_auto]">
      <div className="grid gap-3">
        <div>
          <div className="muted text-xs font-semibold uppercase tracking-[0.16em]">Next Action</div>
          <div className="mt-1 text-base font-semibold">{action.label}</div>
          <div className="mt-1 max-w-3xl text-sm leading-6 text-[var(--text-secondary)]">{action.body}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          {stages.map((stage) => (
            <Link key={stage.label} href={stage.href} className={`rounded border px-3 py-2 text-xs ${stageClass(stage.active)}`}>
              {stage.label}
            </Link>
          ))}
        </div>
      </div>
      <div className="flex items-start justify-end">
        <Link href={action.href} className={`rounded border px-4 py-2 text-sm font-semibold ${actionToneClass(action.tone)}`}>
          {action.label}
        </Link>
      </div>
    </section>
  );
}
