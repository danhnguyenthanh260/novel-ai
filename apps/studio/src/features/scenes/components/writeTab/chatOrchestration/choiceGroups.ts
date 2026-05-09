import type { ChoiceGroupBlock, ChoiceGroupChoice, StudioChatIntent } from "@/features/scenes/components/writeTab/types";

export type StructuredChoiceSelection = {
  choiceGroupId: string;
  choiceId: string;
  label: string;
  value: string;
  intent?: StudioChatIntent;
};

type BrainstormOption = {
  id: "hidden_wound" | "trigger_event" | "opening_scene";
  label: string;
  value: string;
  description: string;
};

const fallbackOptions: BrainstormOption[] = [
  { id: "hidden_wound", label: "Hidden wound", value: "1", description: "Define the pain the protagonist is hiding and why they cannot say it directly." },
  { id: "trigger_event", label: "Trigger event", value: "2", description: "Choose the incident that forces the hidden conflict into the open." },
  { id: "opening_scene", label: "Opening scene", value: "3", description: "Find the first visual scene that reveals the conflict without explaining it." },
];

function normalized(seed: string): string {
  return seed.trim().toLowerCase();
}

function optionsForSeed(seed: string): BrainstormOption[] {
  const lower = normalized(seed);
  if (/\bbomb\b|\bheart attack\b|\bheart atack\b|\bscience\b|\blab\b/.test(lower)) {
    return [
      { id: "hidden_wound", label: "Hidden wound", value: "1", description: "The protagonist believes her research helped create the bomb design that caused a death by panic and heart failure." },
      { id: "trigger_event", label: "Trigger event", value: "2", description: "A second attack appears, and only she recognizes the scientific pattern linking it to the old tragedy." },
      { id: "opening_scene", label: "Opening scene", value: "3", description: "She is in a hospital corridor after a bombing, watching a heart monitor flatline while a lab sample in her pocket starts reacting." },
    ];
  }
  if (/\bsad\b|\bgirl\b|\bwound\b|\bgrief\b/.test(lower)) {
    return [
      { id: "hidden_wound", label: "Hidden wound", value: "1", description: "The sad girl hides the real reason she stopped trusting the people who say they love her." },
      { id: "trigger_event", label: "Trigger event", value: "2", description: "A small public crisis forces her private grief into view before she is ready to explain it." },
      { id: "opening_scene", label: "Opening scene", value: "3", description: "Start with her performing one ordinary task while every detail quietly reveals what she has lost." },
    ];
  }
  if (/\badopt|\badopted\b|\badoption\b|\bfamily\b/.test(lower)) {
    return [
      { id: "hidden_wound", label: "Quiet coming-of-age", value: "1", description: "He is loved but still feels like a guest, so the conflict has no obvious villain." },
      { id: "trigger_event", label: "Identity mystery", value: "2", description: "A normal family habit exposes a clue that his past was deliberately hidden from him." },
      { id: "opening_scene", label: "Family secret", value: "3", description: "The family knows why he does not belong, but protecting him has become another kind of lie." },
    ];
  }
  return fallbackOptions;
}

export function buildBrainstormAngleChoiceGroup(seed: string, id = `choice-brainstorm-angle-${Date.now()}`): ChoiceGroupBlock {
  return {
    id,
    type: "choice_group",
    source: "assistant",
    prompt: "Choose an angle to expand.",
    selectionMode: "single",
    choices: optionsForSeed(seed),
    submitBehavior: "immediate",
    metadata: {
      intent: "BRAINSTORM_EXPAND_CHOICE",
      groupKind: "brainstorm_angle",
      seed,
    },
  };
}

function followupChoices(): ChoiceGroupChoice[] {
  return [
    { id: "scene_goal", label: "Scene goal", value: "scene goal", description: "Turn the selected angle into a clear scene objective." },
    { id: "character_contradiction", label: "Character contradiction", value: "character contradiction", description: "Expand the inner and outer tension in the character." },
    { id: "chapter_opening", label: "Chapter opening", value: "chapter opening", description: "Shape the angle into the first scene setup." },
  ];
}

export function buildBrainstormFollowupChoiceGroup(seed: string | null | undefined, id = `choice-brainstorm-followup-${Date.now()}`): ChoiceGroupBlock {
  return {
    id,
    type: "choice_group",
    source: "assistant",
    prompt: "Choose what to turn this into next.",
    selectionMode: "single",
    choices: followupChoices(),
    submitBehavior: "immediate",
    metadata: {
      intent: "BRAINSTORM_CHARACTER_CONTRADICTION",
      groupKind: "brainstorm_followup",
      seed: seed ?? null,
    },
  };
}

export function choiceSelectionFromBlock(block: ChoiceGroupBlock, choice: ChoiceGroupChoice): StructuredChoiceSelection {
  const intent = choice.id === "scene_goal" ? "BRAINSTORM_SCENE_GOAL"
    : choice.id === "character_contradiction" ? "BRAINSTORM_CHARACTER_CONTRADICTION"
      : choice.id === "chapter_opening" ? "BRAINSTORM_CHAPTER_OPENING"
        : block.metadata?.intent;
  return {
    choiceGroupId: block.id,
    choiceId: choice.id,
    label: choice.label,
    value: choice.value,
    intent,
  };
}
