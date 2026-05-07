import { detectStudioIntent, routeStudioIntent } from "@/features/scenes/components/writeTab/chatOrchestration/intentRouter";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

export function runIntentRouterSelfTest(): void {
  assert(detectStudioIntent("Hi") === "CHAT", "greeting maps to CHAT");
  assert(detectStudioIntent("continue") === "WRITE", "continue maps to WRITE");
  assert(detectStudioIntent("plan first") === "PLAN", "plan first maps to PLAN");
  assert(detectStudioIntent("analyze source") === "ANALYZE", "analyze source maps to ANALYZE");
  assert(detectStudioIntent("research worldbuilding") === "RESEARCH", "research maps to RESEARCH");
  assert(detectStudioIntent("switch story") === "SWITCH_STORY", "switch story maps to SWITCH_STORY");
  assert(detectStudioIntent("add characters") === "ADD_CONTEXT", "add characters maps to ADD_CONTEXT");
  assert(detectStudioIntent("brainstorm with me, no writing yet") === "BRAINSTORM", "brainstorm maps to BRAINSTORM");
  assert(detectStudioIntent("review what was written") === "REVIEW", "review maps to REVIEW");
  assert(detectStudioIntent("split this chapter") === "SPLIT", "split maps to SPLIT");
  assert(detectStudioIntent("inspect context") === "INSPECT", "inspect maps to INSPECT");
  assert(detectStudioIntent("approve this") === "APPROVE", "approve maps to APPROVE");
  assert(detectStudioIntent("what do we do now") === "CHAT", "next-step question maps to CHAT");

  const ambiguous = routeStudioIntent({ message: "maybe later", readiness: "degraded" });
  assert(ambiguous.needsClarification && ambiguous.assistantText !== null, "ambiguous input asks one clarifying question");

  const brainstormFollowup = routeStudioIntent({ message: "maybe a betrayal scene", readiness: "degraded", mode: "brainstorm" });
  assert(brainstormFollowup.intent === "BRAINSTORM" && !brainstormFollowup.needsClarification, "brainstorm mode keeps free chat active");

  const adoptionBrainstorm = routeStudioIntent({
    message: "a boy, who is adopted, living in normal family, he does not like it, confused",
    readiness: "degraded",
    mode: "brainstorm",
  });
  assert(adoptionBrainstorm.assistantText?.includes("adopted") === true, "brainstorm mode responds to adoption seed");

  const blockedWrite = routeStudioIntent({ message: "continue", readiness: "blocked" });
  assert(blockedWrite.command === "/write chapter", "blocked write still routes through preflight");
}

runIntentRouterSelfTest();
