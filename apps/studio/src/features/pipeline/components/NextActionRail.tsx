import Link from "next/link";
import type { ContextReadiness } from "@/features/scenes/components/writeTab/types";

type NextActionRailProps = {
  storySlug: string;
  hasChapter: boolean;
  hasDraft: boolean;
  continuityQueued: boolean;
  readiness: ContextReadiness;
  loading: boolean;
};

type RailStep = {
  key: string;
  label: string;
  href: string;
  status: "ready" | "current" | "waiting" | "blocked";
};

function storyHref(storySlug: string, suffix: string): string {
  return `/stories/${encodeURIComponent(storySlug)}${suffix}`;
}

function primaryAction(props: NextActionRailProps): { label: string; detail: string; href: string } {
  if (props.loading) {
    return {
      label: "Wait for workspace state",
      detail: "Studio is loading chapter and draft state before choosing the next action.",
      href: storyHref(props.storySlug, "/pipelines"),
    };
  }
  if (!props.hasChapter) {
    return {
      label: "Add source material",
      detail: "Start with ingest so the story has chapters, source text, and pipeline state.",
      href: storyHref(props.storySlug, "/ingest"),
    };
  }
  if (!props.hasDraft) {
    return {
      label: "Draft the chapter",
      detail: "Use the write workspace once chapter state exists.",
      href: storyHref(props.storySlug, "/write"),
    };
  }
  if (props.continuityQueued || props.readiness === "blocked") {
    return {
      label: "Review validation",
      detail: "A draft exists and validation needs review before approval.",
      href: storyHref(props.storySlug, "/reviews"),
    };
  }
  return {
    label: "Check analysis and memory",
    detail: "A draft exists. Review analysis and memory state before approval.",
    href: storyHref(props.storySlug, "/analysis"),
  };
}

function readyAfterChapter(props: NextActionRailProps): RailStep["status"] {
  if (!props.hasChapter) return "waiting";
  return props.hasDraft ? "ready" : "current";
}

function reviewStatus(props: NextActionRailProps): RailStep["status"] {
  if (!props.hasDraft) return "waiting";
  return props.continuityQueued || props.readiness === "blocked" ? "current" : "ready";
}

function approvalStatus(props: NextActionRailProps): RailStep["status"] {
  if (!props.hasDraft) return "blocked";
  if (props.readiness === "proceed") return "current";
  return "waiting";
}

function buildSteps(props: NextActionRailProps): RailStep[] {
  return [
    {
      key: "ingest",
      label: "Ingest",
      href: storyHref(props.storySlug, "/ingest"),
      status: props.hasChapter ? "ready" : "current",
    },
    {
      key: "analysis",
      label: "Analysis",
      href: storyHref(props.storySlug, "/analysis"),
      status: readyAfterChapter(props),
    },
    {
      key: "write",
      label: "Write",
      href: storyHref(props.storySlug, "/write"),
      status: readyAfterChapter(props),
    },
    {
      key: "review",
      label: "Review",
      href: storyHref(props.storySlug, "/reviews"),
      status: reviewStatus(props),
    },
    {
      key: "approval",
      label: "Approval",
      href: storyHref(props.storySlug, "/reviews"),
      status: approvalStatus(props),
    },
  ];
}

function statusLabel(status: RailStep["status"]): string {
  if (status === "current") return "Next";
  if (status === "ready") return "Open";
  if (status === "blocked") return "Blocked";
  return "Wait";
}

export default function NextActionRail(props: NextActionRailProps) {
  const action = primaryAction(props);
  const steps = buildSteps(props);

  return (
    <section className="grid gap-3 border border-[var(--border-subtle)] bg-[var(--bg-surface-muted)] p-3 text-xs">
      <div>
        <div className="muted font-semibold uppercase tracking-[0.16em]">Next Action</div>
        <Link href={action.href} className="primary-action mt-2 block px-3 py-2 text-center text-xs no-underline">
          {action.label}
        </Link>
        <p className="mt-2 leading-5 text-[var(--text-secondary)]">{action.detail}</p>
      </div>

      <div className="grid gap-1" aria-label="Pipeline steps">
        {steps.map((step) => (
          <Link
            key={step.key}
            href={step.href}
            className={`novel-lab-nav-row no-underline ${step.status === "current" ? "novel-lab-nav-row--active" : "novel-lab-nav-row--secondary"}`}
          >
            <span>{step.label}</span>
            <span>{statusLabel(step.status)}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
