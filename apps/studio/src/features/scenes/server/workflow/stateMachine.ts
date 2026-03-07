export type SceneStatus = "DRAFTING" | "DRAFTED" | "EVALUATED" | "REVISED" | "LOCKED";

const ALLOWED: SceneStatus[] = ["DRAFTING", "DRAFTED", "EVALUATED", "REVISED", "LOCKED"];

const TRANSITIONS: Record<SceneStatus, SceneStatus[]> = {
  DRAFTING: ["DRAFTED", "LOCKED"],
  DRAFTED: ["EVALUATED", "LOCKED"],
  EVALUATED: ["REVISED", "LOCKED"],
  REVISED: ["EVALUATED", "LOCKED"],
  LOCKED: ["DRAFTING"],
};

export function isLocked(status: SceneStatus): boolean {
  return status === "LOCKED";
}

export function assertKnownStatus(status: string): asserts status is SceneStatus {
  if (!ALLOWED.includes(status as SceneStatus)) {
    throw new Error(`Status khong hop le trong DB: ${status}`);
  }
}

export function assertTransition(fromStatus: string, toStatus: SceneStatus): void {
  assertKnownStatus(fromStatus);
  if (!TRANSITIONS[fromStatus].includes(toStatus)) {
    throw new Error(`Transition khong hop le: ${fromStatus} -> ${toStatus}`);
  }
}
