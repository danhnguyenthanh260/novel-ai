from __future__ import annotations

import json
from typing import Any, Dict, List

from worker_common import call_llm_json
from worker_runtime_config import get_llm_timeout
from worker_ingest_repo import (
    insert_agent_memory_vector,
    insert_agent_feedback_loop,
    mark_agent_janitor_task_done,
)


def _safe_text(value: Any) -> str:
    return str(value or "").strip()


def _heuristic_digest(trace_rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    if not trace_rows:
        return {"core_facts": [], "nutrition_summary": "No trace rows found for this job."}
    by_agent: Dict[str, int] = {}
    failures: List[str] = []
    for row in trace_rows:
        agent = _safe_text(row.get("agent_name")) or "UNKNOWN"
        by_agent[agent] = by_agent.get(agent, 0) + 1
        status = _safe_text(row.get("status")).upper()
        if status in ("FAILED", "TIMEOUT"):
            err = _safe_text(row.get("error_code")) or "UNKNOWN_ERROR"
            failures.append(f"{agent}:{err}")
    top_agents = sorted(by_agent.items(), key=lambda x: x[1], reverse=True)[:5]
    facts = [f"Agent {name} executed {count} run(s)." for name, count in top_agents]
    if failures:
        facts.append(f"Observed failures: {', '.join(failures[:8])}")
    summary = " | ".join(facts[:4]) if facts else "Trace available but no strong signals extracted."
    return {
        "core_facts": facts[:12],
        "nutrition_summary": summary[:2000],
    }


def _llm_digest(trace_rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    compact_rows = []
    for row in trace_rows[:60]:
        compact_rows.append(
            {
                "agent_name": row.get("agent_name"),
                "status": row.get("status"),
                "error_code": row.get("error_code"),
                "latency_ms": row.get("latency_ms"),
                "quality": row.get("quality_json") or {},
                "created_at": row.get("created_at"),
            }
        )
    user_content = (
        "Summarize these agent run traces into compact clean memory.\n"
        "Output JSON only with shape: "
        "{\"core_facts\": [\"...\"], \"nutrition_summary\": \"...\", \"risks\": [\"...\"]}\n\n"
        f"TRACE_ROWS:\n{json.dumps(compact_rows, ensure_ascii=False)}"
    )
    res = call_llm_json(
        [{"role": "user", "content": user_content}],
        max_tokens=900,
        temperature=0.2,
        timeout_sec=get_llm_timeout("writing_analysis"),
    )
    if not isinstance(res, dict):
        return {}
    return res


def process_agent_janitor_task(conn, task: Dict[str, Any]) -> None:
    task_id = int(task.get("id") or 0)
    story_id = int(task.get("story_id") or 0)
    job_id = int(task.get("job_id") or 0)
    chapter_id = _safe_text(task.get("chapter_id")) or None
    if not task_id or not story_id or not job_id:
        raise ValueError("JANITOR_TASK_INVALID")

    cur = conn.cursor()
    try:
        cur.execute(
            """
            SELECT id, agent_name, status, error_code, latency_ms, quality_json, created_at::text
            FROM public.agent_run_trace
            WHERE story_id = %s
              AND job_id = %s
            ORDER BY id DESC
            LIMIT 120
            """,
            (story_id, job_id),
        )
        rows = cur.fetchall() or []
        trace_rows = [
            {
                "id": r[0],
                "agent_name": r[1],
                "status": r[2],
                "error_code": r[3],
                "latency_ms": r[4],
                "quality_json": r[5],
                "created_at": r[6],
            }
            for r in rows
        ]
    finally:
        cur.close()

    heuristic = _heuristic_digest(trace_rows)
    llm = _llm_digest(trace_rows)
    core_facts = llm.get("core_facts") if isinstance(llm.get("core_facts"), list) else heuristic.get("core_facts") or []
    nutrition_summary = _safe_text(llm.get("nutrition_summary")) or _safe_text(heuristic.get("nutrition_summary"))
    risks = llm.get("risks") if isinstance(llm.get("risks"), list) else []

    for idx, fact in enumerate(core_facts[:10], start=1):
        text = _safe_text(fact)
        if not text:
            continue
        insert_agent_memory_vector(
            conn,
            story_id=story_id,
            chapter_id=chapter_id,
            agent_name="SUPERVISOR",
            source_run_trace_id=None,
            memory_type="STYLE_ANCHOR",
            memory_text=f"[JANITOR_JOB_{job_id}][FACT_{idx}] {text}"[:6000],
            embedding=[],
            score=6.5,
            tags={
                "source": "JANITOR_DIGEST",
                "job_id": job_id,
                "chapter_id": chapter_id,
            },
        )

    if nutrition_summary:
        insert_agent_feedback_loop(
            conn,
            story_id=story_id,
            chapter_id=chapter_id,
            agent_name="SUPERVISOR",
            run_trace_id=None,
            feedback_source="SYSTEM",
            feedback_type="KEEP",
            feedback_text=f"[JANITOR_DIGEST] {nutrition_summary}"[:2000],
            weight=1.2,
            created_by="janitor",
        )
    if risks:
        risk_text = " | ".join([_safe_text(x) for x in risks if _safe_text(x)])[:1800]
        if risk_text:
            insert_agent_feedback_loop(
                conn,
                story_id=story_id,
                chapter_id=chapter_id,
                agent_name="SUPERVISOR",
                run_trace_id=None,
                feedback_source="SYSTEM",
                feedback_type="RULE",
                feedback_text=f"[JANITOR_RISK] {risk_text}",
                weight=1.6,
                created_by="janitor",
            )

    mark_agent_janitor_task_done(conn, task_id)
