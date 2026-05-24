import {
  buildBrainstormAngleChoiceGroup,
  buildBrainstormContinuationNextChoiceGroup,
  buildBrainstormFollowupChoiceGroup,
  choiceSelectionFromBlock,
} from "@/features/scenes/components/writeTab/chatOrchestration/choiceGroups";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

export function runChoiceGroupsSelfTest(): void {
  const angle = buildBrainstormAngleChoiceGroup("bomb, heart attack, science", "angle-test");
  assert(angle.type === "choice_group", "angle choices render as a choice group");
  assert(angle.selectionMode === "single", "brainstorm angle is single-choice");
  assert(angle.choices.length === 3, "brainstorm angle has three choices");
  assert(angle.choices[0].description?.includes("bomb design") === true, "angle choices use seed-specific details");

  const selection = choiceSelectionFromBlock(angle, angle.choices[0]);
  assert(selection.intent === "BRAINSTORM_EXPAND_CHOICE", "angle selection preserves structured expand intent");
  assert(selection.value === "1", "angle selection keeps freeform fallback value");

  const followup = buildBrainstormFollowupChoiceGroup("a girl", "followup-test");
  const character = followup.choices.find((choice) => choice.id === "character_contradiction");
  assert(Boolean(character), "follow-up choices include character contradiction");
  assert(Boolean(character && choiceSelectionFromBlock(followup, character).intent === "BRAINSTORM_CHARACTER_CONTRADICTION"), "follow-up click maps to structured brainstorm continuation");

  const continuation = buildBrainstormContinuationNextChoiceGroup("a girl", "continuation-test");
  assert(continuation.metadata?.groupKind === "brainstorm_continuation_next", "continuation choices carry stage metadata");
  assert(continuation.choices[0].id === "scene_goal", "continuation option one is scene goal");
  const breakEvent = continuation.choices.find((choice) => choice.id === "break_event");
  assert(Boolean(breakEvent && choiceSelectionFromBlock(continuation, breakEvent).intent === "BRAINSTORM_BREAK_EVENT"), "break event click maps to structured brainstorm continuation");

  const afterSceneGoal = buildBrainstormContinuationNextChoiceGroup("a girl", "continuation-after-scene-goal", "scene_goal");
  assert(afterSceneGoal.choices.every((choice) => choice.id !== "scene_goal"), "continuation choices exclude the action just selected");
  assert(afterSceneGoal.choices[0].id === "character_contradiction", "after scene goal, option one is character contradiction");
}

runChoiceGroupsSelfTest();
