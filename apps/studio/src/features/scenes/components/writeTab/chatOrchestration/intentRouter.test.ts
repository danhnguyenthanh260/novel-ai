import { detectStudioIntent, routeStudioIntent } from "@/features/scenes/components/writeTab/chatOrchestration/intentRouter";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

// Dense self-test keeps router regression cases beside the deterministic router.
// eslint-disable-next-line complexity
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
  assert(detectStudioIntent("How do I run this src, and how do I test it?") === "REPO_RUN_HELP", "run/test help overrides brainstorm");
  assert(detectStudioIntent("what angle?") === "BRAINSTORM_CLARIFICATION", "angle question maps to brainstorm clarification");
  assert(detectStudioIntent("1") === "BRAINSTORM_EXPAND_CHOICE", "numbered brainstorm choice maps to expand choice");

  const ambiguous = routeStudioIntent({ message: "maybe later", readiness: "degraded" });
  assert(ambiguous.needsClarification && ambiguous.assistantText !== null, "ambiguous input asks one clarifying question");

  const brainstormFollowup = routeStudioIntent({ message: "maybe a betrayal scene", readiness: "degraded", mode: "brainstorm" });
  assert(brainstormFollowup.intent === "BRAINSTORM" && !brainstormFollowup.needsClarification, "brainstorm mode keeps free chat active");
  assert(brainstormFollowup.brainstormSeed === "maybe a betrayal scene", "brainstorm seed is retained for follow-up clarification");

  const adoptionBrainstorm = routeStudioIntent({
    message: "a boy, who is adopted, living in normal family, he does not like it, confused",
    readiness: "degraded",
    mode: "brainstorm",
  });
  assert(adoptionBrainstorm.assistantText?.includes("adopted") === true, "brainstorm mode responds to adoption seed");
  assert(adoptionBrainstorm.assistantText?.includes("1.") === true, "brainstorm mode renders numbered options");

  const scienceBrainstorm = routeStudioIntent({
    message: "bomb, heart attack, science",
    readiness: "degraded",
    mode: "brainstorm",
  });
  assert(scienceBrainstorm.assistantText?.includes("science-thriller tragedy") === true, "science seed gets concrete genre framing");
  assert(scienceBrainstorm.assistantText?.includes("bomb design") === true, "science seed uses bomb detail");
  assert(scienceBrainstorm.assistantText?.includes("heart monitor") === true, "science seed uses heart detail");

  const repoHelp = routeStudioIntent({
    message: "How do I run this src, and how do I test it?",
    readiness: "degraded",
    mode: "brainstorm",
    recentBrainstormSeed: "bomb, heart attack, science",
  });
  assert(repoHelp.intent === "REPO_RUN_HELP", "repo help wins over active brainstorm mode");
  assert(repoHelp.assistantText?.includes("npm run dev") === true, "repo help includes run command");
  assert(repoHelp.assistantText?.includes("npm run typecheck") === true, "repo help includes test/check command");

  const clarifyAngle = routeStudioIntent({
    message: "what angle?",
    readiness: "degraded",
    mode: "brainstorm",
    recentBrainstormSeed: "bomb, heart attack, science",
  });
  assert(clarifyAngle.intent === "BRAINSTORM_CLARIFICATION", "angle clarification wins over seed handling");
  assert(clarifyAngle.assistantText?.includes("By \"angle\"") === true, "angle clarification explains the term");
  assert(clarifyAngle.assistantText?.includes("bomb design") === true, "angle clarification uses previous seed");

  const quotedClarification = routeStudioIntent({
    message: "I can work with this seed: bomb, heart atack, science\n\nThree angles to explore...\n, wwhat angle",
    readiness: "degraded",
    mode: "brainstorm",
    recentBrainstormSeed: "bomb, heart attack, science",
  });
  assert(quotedClarification.intent === "QUOTED_PREVIOUS_RESPONSE_QUESTION", "quoted assistant text plus question maps to clarification");
  assert(quotedClarification.assistantText?.startsWith("By \"angle\"") === true, "quoted assistant text is not treated as a new seed");

  const blockedWrite = routeStudioIntent({ message: "continue", readiness: "blocked" });
  assert(blockedWrite.command === "/write chapter", "blocked write still routes through preflight");
}

runIntentRouterSelfTest();
