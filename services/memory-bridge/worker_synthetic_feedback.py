import json
from typing import Optional

def record_synthetic_feedback(
    conn,
    story_id: int,
    chapter_id: str,
    rejection_reason: str,
    impact_score: float = 0.4
) -> None:
    """
    Simulates a Supervisor Agent's feedback when the Reviewer Agent rejects a proposed split.
    Inserts a rating of -1 and structured tags with the rejection reason into public.split_feedback.
    Includes idempotency checks to prevent spamming the same reason.
    """
    cur = conn.cursor()
    try:
        # Idempotency check: Don't insert if a very similar feedback was added in the last 12 hours
        cur.execute(
            """
            SELECT id
            FROM public.split_feedback
            WHERE story_id = %s
              AND chapter_id = %s
              AND rating = -1
              AND created_at >= now() - interval '12 hours'
              AND structured_tags::text LIKE %s
            LIMIT 1
            """,
            (story_id, chapter_id, f"%{rejection_reason[:50]}%")
        )
        if cur.fetchone():
            print(f"[Synthetic Feedback] Skipped duplicate feedback for story {story_id}, chapter {chapter_id}: {rejection_reason}")
            return

        structured_tags = {
            "total_impact": impact_score,
            "findings": [
                {
                    "category": "BOUNDARY_LOGIC",
                    "severity": 4,
                    "target_text": "",
                    "details": rejection_reason,
                    "impact_score": impact_score,
                    "action_taken": "SYSTEM_REJECT"
                }
            ]
        }
        
        user_note = f"SYSTEM AUTO-REJECT: Constraints Violated - {rejection_reason[:150]}"

        cur.execute(
            """
            INSERT INTO public.split_feedback
            (story_id, chapter_id, scene_idx, user_note, rating, structured_tags, created_at)
            VALUES (%s, %s, %s, %s, %s, %s::jsonb, now())
            """,
            (
                story_id,
                chapter_id,
                -1, # -1 to indicate chapter-level rather than a specific scene index
                user_note,
                -1, # -1 rating
                json.dumps(structured_tags)
            )
        )
        print(f"[Synthetic Feedback] Recorded new feedback for story {story_id}, chapter {chapter_id}.")
        
    except Exception as e:
        print(f"[Synthetic Feedback] Error recording synthetic feedback: {e}")
    finally:
        cur.close()
