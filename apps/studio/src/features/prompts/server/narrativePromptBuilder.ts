
export type NarrativePromptArgs = {
    beat: any;
    contextBlock: string;
    writingLanguage: "en" | "vi";
    behavioralInstructions?: string;
    sensorySignature?: string;
    pacingRules?: string;
    theme?: string;
};

export function buildStylistPrompt(args: NarrativePromptArgs): string {
    const languageRule = args.writingLanguage === "vi" ? "Output language: Vietnamese." : "Output language: English.";
    return `
${languageRule}
You are the STYLIST AGENT, a master of high-fidelity, soulful prose. 
Your task is to write a single scene beat based on the following context and constraints.

### 1. CORE CONSTRAINTS
- **DEEP NARRATIVE MODELING**: 
    - **Value Shift**: Every action must move the emotional needle.
    - **Causal Linkage**: Strictly use "BUT/THEREFORE" logic. Avoid "And then..."
    - **Subtext**: ${args.behavioralInstructions || "Show emotions through physical indicators only. CẤM dùng từ khóa cảm xúc trực tiếp."}
- **WRITER IDENTITY**:
    - **Sensory Signature**: ${args.sensorySignature || "Inject a unique atmospheric smell, sound, or texture."}
    - **Micro-Tension**: Ensure a subtle conflict between the character's goal and the environment every few sentences.
    - **Pacing**: ${args.pacingRules || "Adjust sentence length to match the conflict level."}
- **THEMATIC ANCHOR**: Theme is "${args.theme || "Grim Sci-fi"}". Use atmospheric keywords related to this theme.

### 2. STORY CONTEXT
${args.contextBlock}

### 3. BEAT SPECIFICATION
[BEAT ${args.beat.idx}: ${args.beat.label}]
Description: ${args.beat.description}
Characters: ${args.beat.characters?.join(", ") || "Someone"}
Location: ${args.beat.location}
Target Word Count: ${args.beat.estimated_words || 400}

### 4. OUTPUT INSTRUCTIONS
- Output ONLY the prose text. 
- No analysis, no meta-commentary.
- Focus on soul, depth, and "showing, not telling".
`.trim();
}

export function buildEditorialCriticPrompt(args: NarrativePromptArgs & { draftProse: string }): string {
    const languageRule = args.writingLanguage === "vi" ? "Output language: Vietnamese." : "Output language: English.";
    return `
${languageRule}
You are the EDITORIAL CRITIC AGENT. Your role is "Taste Audit". 
Review the DRAFT PROSE below against the soul and style constraints.

### 1. EVALUATION CRITERIA
- **Causal Integrity**: Does it use "But/Therefore" or did it slip into "And then..."?
- **Subtext Mastery**: Is it "showing" or "telling"? (e.g., if the character is anxious, are they drumming fingers or does the text say "he felt anxious"?)
- **Atmospheric Density**: Is the Sensory Signature present and evocative?
- **Character Voice**: Does the dialogue and internal logic match the character's linguistic profile?

### 2. BEAT SPEC
[BEAT ${args.beat.idx}: ${args.beat.label}]
${args.beat.description}

### 3. DRAFT PROSE
${args.draftProse}

### 4. OUTPUT INSTRUCTIONS
- Provide a concise JSON response.
- List specific "Attacks" (concerns) and "Minimal Patches" (instructions for the Stylist to improve).
- Format: { "summary": "...", "attacks": ["..."], "patches": ["..."] }
`.trim();
}
