
import type { PoolClient } from "pg";

export async function insertAgentProfileEvent(
  client: PoolClient,
  args: {
    agentProfileId: number;
    storyId?: number | null;
    action: "CREATE_PROFILE" | "SEAL" | "UNSEAL" | "XP_RECALC" | "SLOT_ATTACH" | "SLOT_REPLACE";
    actor?: string;
    details?: Record<string, unknown>;
  }
): Promise<void> {
  const actor = (args.actor || "studio").trim() || "studio";
  await client.query(
    `INSERT INTO public.agent_profile_event
       (agent_profile_id, story_id, action, details_json, actor)
     VALUES ($1, $2, $3, $4::jsonb, $5)`,
    [args.agentProfileId, args.storyId ?? null, args.action, JSON.stringify(args.details || {}), actor]
  );
}
