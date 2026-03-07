type CriticOutput = {
  summary: string;
  attack: Array<{
    category: string;
    severity: number;
    issue: string;
    evidence: string[];
    why_it_matters: string;
    fix_hint: string;
  }>;
  steelman: Array<{
    claim: string;
    evidence: string[];
    keep_reason: string;
    risk_if_changed: string;
  }>;
  must_fix: Array<{
    id: string;
    patch_type: string;
    target: string;
    instruction: string;
    constraints?: string[];
  }>;
  nice_to_have: Array<{
    id: string;
    patch_type: string;
    target: string;
    instruction: string;
    constraints?: string[];
  }>;
  risk_flags: string[];
};

type JudgePatch = {
  id: string;
  priority: "must" | "should" | "could";
  patch_type: string;
  target: string;
  instruction: string;
  tests: string[];
};

export function renderAutowriteContextBlock(args: {
  canon: string[];
  timeline: string[];
  style: string[];
  historianGuidance?: string[];
}): string {
  return [
    "CANON_PACK",
    ...(args.canon.length > 0 ? args.canon : ["- (none)"]),
    "",
    "TIMELINE_PACK",
    ...(args.timeline.length > 0 ? args.timeline : ["- (none)"]),
    "",
    "STYLE_PACK",
    ...(args.style.length > 0 ? args.style : ["- (none)"]),
    "",
    "HISTORIAN_GUIDANCE",
    ...(Array.isArray(args.historianGuidance) && args.historianGuidance.length > 0 ? args.historianGuidance : ["- (none)"]),
  ].join("\n");
}

export function buildWriterRound1Prompt(params: {
  sceneSpec: string;
  contextBlock: string;
  currentText: string;
  writingLanguage: "en" | "vi";
}): string {
  const languageRule = params.writingLanguage === "vi" ? "Output language: Vietnamese." : "Output language: English.";
  return (
    `${languageRule}\n` +
    "You are the Writer. Produce a grim sci-fi scene in third-person limited unless specified otherwise.\n" +
    "Constraints:\n" +
    "- Do not contradict CANON and TIMELINE.\n" +
    "- Show-don't-tell. Tight pacing.\n" +
    "- Output only scene text. No headings, no analysis.\n\n" +
    `SCENE_SPEC:\n${params.sceneSpec}\n\n` +
    `${params.contextBlock}\n\n` +
    `CURRENT_DRAFT_CONTEXT (optional):\n${params.currentText.slice(0, 1800) || "(none)"}`
  );
}

export function buildCriticPrompt(params: {
  sceneSpec: string;
  contextBlock: string;
  draftText: string;
  writingLanguage: "en" | "vi";
}): string {
  const languageRule = params.writingLanguage === "vi" ? "Output language: Vietnamese." : "Output language: English.";
  return (
    `${languageRule}\n` +
    "You are Critic+Defender for a grim sci-fi novel scene.\n" +
    "Task: (1) Attack concrete issues vs CANON/TIMELINE/POV/logic/pacing/tone, (2) Steelman what should be preserved, (3) propose minimal patches.\n" +
    "Rules:\n" +
    "- Be specific. Quote short spans from draft as evidence (<=20 words).\n" +
    "- Prefer minimal edits.\n" +
    "- Output MUST be valid JSON only.\n\n" +
    `SCENE_SPEC:\n${params.sceneSpec}\n\n` +
    `${params.contextBlock}\n\n` +
    `DRAFT:\n${params.draftText.slice(0, 7000)}\n\n` +
    "OUTPUT JSON SCHEMA:\n" +
    '{ "summary":"...", "attack":[{"category":"canon|timeline|logic|pov|pacing|tone|continuity|clarity","severity":1,"issue":"...","evidence":["..."],"why_it_matters":"...","fix_hint":"..."}], "steelman":[{"claim":"...","evidence":["..."],"keep_reason":"...","risk_if_changed":"..."}], "must_fix":[{"id":"MF1","patch_type":"replace|insert|delete|reorder|clarify|tighten","target":"...","instruction":"...","constraints":["..."]}], "nice_to_have":[{"id":"NH1","patch_type":"tighten|clarify|style","target":"...","instruction":"..."}], "risk_flags":["..."] }'
  );
}

export function buildJudgePrompt(params: {
  sceneSpec: string;
  draftText: string;
  critic: CriticOutput;
  writingLanguage: "en" | "vi";
}): string {
  const languageRule = params.writingLanguage === "vi" ? "Output language: Vietnamese." : "Output language: English.";
  return (
    `${languageRule}\n` +
    "You are the Judge. Decide accept/revise/rewrite based on draft + critic report.\n" +
    "Rules:\n" +
    "- Prefer ACCEPT if issues are minor.\n" +
    "- If canon/timeline violated: must be REVISE or REWRITE.\n" +
    "- Output MUST be valid JSON only.\n\n" +
    `SCENE_SPEC:\n${params.sceneSpec}\n\n` +
    `DRAFT:\n${params.draftText.slice(0, 5000)}\n\n` +
    `CRITIC_JSON:\n${JSON.stringify(params.critic)}\n\n` +
    "OUTPUT JSON:\n" +
    '{ "verdict":"accept|revise|rewrite", "scores":{"canon":0,"logic":0,"pacing":0,"tone":0,"pov":0,"clarity":0}, "threshold_pass":true, "rationale":"...", "patch_list":[{"id":"P1","priority":"must|should|could","patch_type":"replace|insert|delete|reorder|clarify|tighten","target":"...","instruction":"...","tests":["..."]}], "stop_reason":"accept_threshold|max_rounds|rewrite_required" }'
  );
}

export function buildWriterRound2Prompt(params: {
  draftText: string;
  patchList: JudgePatch[];
  writingLanguage: "en" | "vi";
}): string {
  const languageRule = params.writingLanguage === "vi" ? "Output language: Vietnamese." : "Output language: English.";
  return (
    `${languageRule}\n` +
    "You are the Writer.\n" +
    "Revise the draft by applying Judge patches.\n" +
    "Rules:\n" +
    "- Apply all 'must' patches exactly.\n" +
    "- Preserve strong lines unless explicitly replaced.\n" +
    "- Keep POV/tone consistent.\n" +
    "- Output only revised scene text.\n\n" +
    `DRAFT:\n${params.draftText.slice(0, 7000)}\n\n` +
    `PATCH_LIST_JSON:\n${JSON.stringify(params.patchList)}`
  );
}
