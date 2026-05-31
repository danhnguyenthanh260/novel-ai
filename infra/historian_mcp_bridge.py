#!/usr/bin/env python3
from __future__ import annotations

import base64
import json
import os
import re
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import Any, Dict, List, Tuple
from urllib.error import URLError
from urllib.request import Request, urlopen


HOST = os.getenv("HISTORIAN_BRIDGE_HOST", "0.0.0.0")
PORT = int(os.getenv("HISTORIAN_BRIDGE_PORT", "8090"))
QDRANT_URL = os.getenv("HISTORIAN_QDRANT_URL", "http://qdrant:6333").rstrip("/")
NEO4J_HTTP_URL = os.getenv("HISTORIAN_NEO4J_HTTP_URL", "http://neo4j:7474/db/neo4j/tx/commit")
NEO4J_USER = os.getenv("HISTORIAN_NEO4J_USER", "neo4j")
NEO4J_PASSWORD = os.getenv("HISTORIAN_NEO4J_PASSWORD", "novelgraphpass")
TIMEOUT = int(os.getenv("HISTORIAN_BRIDGE_TIMEOUT_SECONDS", "10"))
QDRANT_STYLE_COLLECTION = os.getenv("HISTORIAN_QDRANT_STYLE_COLLECTION", "narrative_swas_memory").strip()
QDRANT_TOP_K = max(1, min(20, int(os.getenv("HISTORIAN_QDRANT_TOP_K", "8"))))
QDRANT_MIN_SCORE = float(os.getenv("HISTORIAN_QDRANT_MIN_SCORE", "0.85"))


def _json_response(handler: BaseHTTPRequestHandler, status: int, payload: Dict[str, Any]) -> None:
    body = json.dumps(payload, ensure_ascii=True).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def _read_json(handler: BaseHTTPRequestHandler) -> Dict[str, Any]:
    raw_len = int(handler.headers.get("Content-Length", "0") or "0")
    if raw_len <= 0:
        return {}
    raw = handler.rfile.read(raw_len)
    try:
        parsed = json.loads(raw.decode("utf-8", errors="replace"))
    except Exception:
        return {}
    return parsed if isinstance(parsed, dict) else {}


def _http_get_json(url: str, timeout: int = TIMEOUT) -> Dict[str, Any]:
    req = Request(url, method="GET")
    with urlopen(req, timeout=timeout) as resp:
        raw = resp.read().decode("utf-8", errors="replace")
    parsed = json.loads(raw) if raw else {}
    return parsed if isinstance(parsed, dict) else {}


def _http_post_json(url: str, payload: Dict[str, Any], timeout: int = TIMEOUT, headers: Dict[str, str] | None = None) -> Dict[str, Any]:
    hdrs = {"Content-Type": "application/json"}
    if headers:
        hdrs.update(headers)
    req = Request(url, data=json.dumps(payload, ensure_ascii=True).encode("utf-8"), headers=hdrs, method="POST")
    with urlopen(req, timeout=timeout) as resp:
        raw = resp.read().decode("utf-8", errors="replace")
    parsed = json.loads(raw) if raw else {}
    return parsed if isinstance(parsed, dict) else {}


def _safe_float(value: Any, fallback: float = 0.0) -> float:
    try:
        x = float(value)
        if x != x:
            return fallback
        return x
    except Exception:
        return fallback


def _clamp(value: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, value))


def _extract_style_dna_vector(payload: Dict[str, Any]) -> List[float]:
    style = payload.get("style_dna") if isinstance(payload.get("style_dna"), dict) else {}
    query = str(payload.get("query") or payload.get("query_text") or "").strip()

    dialogue_ratio = _safe_float(style.get("dialogue_to_narration_ratio"), -1.0)
    adjective_density = _safe_float(style.get("adjective_density"), -1.0)
    metaphor_freq = _safe_float(style.get("metaphor_rhetoric_frequency"), -1.0)

    if dialogue_ratio < 0 or adjective_density < 0 or metaphor_freq < 0:
        q = query
        quote_count = q.count('"') + q.count("“") + q.count("”")
        punctuation_count = sum(q.count(ch) for ch in (".", "!", "?", ",", ";", ":"))
        words = [w for w in q.split() if w.strip()]
        total_words = max(1, len(words))
        if dialogue_ratio < 0:
            dialogue_ratio = _clamp((quote_count / max(2, total_words)) * 2.4, 0.0, 1.0)
        if adjective_density < 0:
            adjective_density = _clamp((punctuation_count / total_words) * 0.7, 0.0, 1.0)
        if metaphor_freq < 0:
            lyrical_terms = ("like", "as", "seems", "shadow", "light", "blood", "wind", "echo", "silence")
            signal = sum(1 for t in lyrical_terms if t in q.lower())
            metaphor_freq = _clamp(signal / 8.0, 0.0, 1.0)

    return [
        round(_clamp(dialogue_ratio, 0.0, 1.0), 6),
        round(_clamp(adjective_density, 0.0, 1.0), 6),
        round(_clamp(metaphor_freq, 0.0, 1.0), 6),
    ]


def _collection_distance(name: str) -> str:
    info = _http_get_json(f"{QDRANT_URL}/collections/{name}")
    result = info.get("result") if isinstance(info.get("result"), dict) else {}
    config = result.get("config") if isinstance(result.get("config"), dict) else {}
    params = config.get("params") if isinstance(config.get("params"), dict) else {}
    vectors = params.get("vectors")
    if isinstance(vectors, dict):
        return str(vectors.get("distance") or "Cosine").strip()
    return "Cosine"


def _normalize_qdrant_score(score: float, distance_kind: str) -> float:
    d = str(distance_kind or "").strip().lower()
    if d in ("euclid", "manhattan"):
        # distance-like metric: lower is better
        return _clamp(1.0 / (1.0 + max(0.0, score)), 0.0, 1.0)
    return _clamp(score, 0.0, 1.0)


def _qdrant_semantic_search(payload: Dict[str, Any]) -> Tuple[float, List[Dict[str, Any]], str]:
    collection = QDRANT_STYLE_COLLECTION
    if not collection:
        return 0.0, [], "missing_collection"

    vector = _extract_style_dna_vector(payload)
    distance_kind = _collection_distance(collection)
    filt: Dict[str, Any] | None = None
    story_id = payload.get("story_id")
    if isinstance(story_id, int) and story_id > 0:
        filt = {"must": [{"key": "story_id", "match": {"value": story_id}}]}

    req_top_k = int(payload.get("top_k") or QDRANT_TOP_K)
    req_top_k = max(1, min(64, req_top_k))
    req_threshold = _clamp(_safe_float(payload.get("threshold"), QDRANT_MIN_SCORE), 0.0, 1.0)

    search_payload: Dict[str, Any] = {
        "vector": vector,
        "limit": req_top_k,
        "with_payload": True,
        "with_vector": False,
        "score_threshold": req_threshold if distance_kind.lower() not in ("euclid", "manhattan") else None,
    }
    if filt:
        search_payload["filter"] = filt
    if search_payload.get("score_threshold") is None:
        search_payload.pop("score_threshold", None)

    search = _http_post_json(
        f"{QDRANT_URL}/collections/{collection}/points/search",
        search_payload,
    )
    rows = search.get("result") if isinstance(search.get("result"), list) else []
    top_matches: List[Dict[str, Any]] = []
    best = 0.0
    for row in rows:
        if not isinstance(row, dict):
            continue
        raw_score = _safe_float(row.get("score"), 0.0)
        norm_score = _normalize_qdrant_score(raw_score, distance_kind)
        if norm_score < req_threshold:
            continue
        payload_obj = row.get("payload") if isinstance(row.get("payload"), dict) else {}
        top_matches.append(
            {
                "id": row.get("id"),
                "score": round(raw_score, 6),
                "similarity": round(norm_score, 6),
                "payload": payload_obj,
            }
        )
        best = max(best, norm_score)

    return round(best, 6), top_matches, f"semantic:{collection}:{distance_kind}"


def _qdrant_semantic_matches(payload: Dict[str, Any]) -> Tuple[List[Dict[str, Any]], str]:
    _, top_matches, detail = _qdrant_semantic_search(payload)
    out: List[Dict[str, Any]] = []
    for row in top_matches:
        payload_obj = row.get("payload") if isinstance(row.get("payload"), dict) else {}
        content = str(
            payload_obj.get("content")
            or payload_obj.get("text")
            or payload_obj.get("body")
            or payload_obj.get("summary")
            or ""
        ).strip()
        if not content:
            continue
        tags_raw = payload_obj.get("tags") if isinstance(payload_obj.get("tags"), list) else []
        tags = [str(x).strip() for x in tags_raw if str(x).strip()][:8]
        category = str(payload_obj.get("category") or payload_obj.get("kind") or "semantic").strip()[:60]
        out.append(
            {
                "id": str(row.get("id") or ""),
                "content": content[:1000],
                "score": _safe_float(row.get("similarity"), 0.0),
                "tags": tags,
                "category": category,
            }
        )
    return out, detail


def _neo4j_headers() -> Dict[str, str]:
    token = base64.b64encode(f"{NEO4J_USER}:{NEO4J_PASSWORD}".encode("utf-8")).decode("ascii")
    return {"Authorization": f"Basic {token}"}


def _neo4j_ping() -> None:
    payload = {"statements": [{"statement": "RETURN 1 AS ok", "parameters": {}}]}
    _http_post_json(NEO4J_HTTP_URL, payload, headers=_neo4j_headers())


def _neo4j_lineage_conflicts(candidate_facts: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    conflicts: List[Dict[str, Any]] = []
    statement = (
        "MATCH (s:Entity)-[r]->(o:Entity) "
        "WHERE toLower(coalesce(s.name,'')) = toLower($subject) "
        "  AND (toLower(coalesce(r.predicate,'')) = toLower($predicate) OR toLower(type(r)) = toLower($rel_type)) "
        "  AND toLower(coalesce(o.name,'')) <> toLower($object) "
        "RETURN s.name AS subject, coalesce(r.predicate, type(r)) AS predicate, o.name AS ground_truth_object "
        "LIMIT 1"
    )
    for fact in candidate_facts[:20]:
        if not isinstance(fact, dict):
            continue
        subject = str(fact.get("subject") or "").strip()
        predicate = str(fact.get("predicate") or "").strip()
        obj = str(fact.get("object") or "").strip()
        if not subject or not predicate or not obj:
            continue
        payload = {
            "statements": [
                {
                    "statement": statement,
                    "parameters": {
                        "subject": subject,
                        "predicate": predicate,
                        "rel_type": _predicate_to_rel_type(predicate),
                        "object": obj,
                    },
                }
            ]
        }
        try:
            res = _http_post_json(NEO4J_HTTP_URL, payload, headers=_neo4j_headers())
            results = res.get("results") if isinstance(res.get("results"), list) else []
            rows = []
            if results and isinstance(results[0], dict):
                rows = results[0].get("data") if isinstance(results[0].get("data"), list) else []
            if rows:
                row = rows[0]
                row_data = row.get("row") if isinstance(row, dict) and isinstance(row.get("row"), list) else []
                if len(row_data) >= 3:
                    conflicts.append(
                        {
                            "subject": str(row_data[0] or subject),
                            "predicate": str(row_data[1] or predicate),
                            "candidate_object": obj,
                            "ground_truth_object": str(row_data[2] or ""),
                            "reason": "GRAPH_LINEAGE_MISMATCH",
                        }
                    )
        except Exception:
            continue
    return conflicts


def _neo4j_neighborhood(story_id: int, cast: List[str], limit: int = 15, depth: int = 2) -> List[Dict[str, Any]]:
    cast_clean = [str(x).strip() for x in cast if str(x).strip()]
    cast_lc = list({x.lower() for x in cast_clean})[:40]
    if story_id <= 0 or not cast_lc:
        return []
    cap_limit = max(1, min(64, int(limit or 15)))
    use_depth = 2 if int(depth or 2) >= 2 else 1
    statements: List[Dict[str, Any]] = []
    hop1_stmt = (
        "MATCH (a:Entity)-[r]-(b:Entity) "
        "WHERE a.story_id = $story_id AND b.story_id = $story_id "
        "  AND toLower(coalesce(a.name,'')) IN $cast_lc "
        "RETURN a.name AS src, coalesce(r.predicate, type(r)) AS rel, b.name AS dst, "
        "       coalesce(r.confidence, 0.5) AS weight, 1 AS hop "
        "ORDER BY weight DESC "
        "LIMIT $limit"
    )
    statements.append(
        {"statement": hop1_stmt, "parameters": {"story_id": int(story_id), "cast_lc": cast_lc, "limit": cap_limit}}
    )
    if use_depth >= 2:
        hop2_stmt = (
            "MATCH (a:Entity)-[r1]-(m:Entity)-[r2]-(b:Entity) "
            "WHERE a.story_id = $story_id AND m.story_id = $story_id AND b.story_id = $story_id "
            "  AND toLower(coalesce(a.name,'')) IN $cast_lc "
            "  AND b <> a "
            "RETURN a.name AS src, coalesce(r2.predicate, type(r2)) AS rel, b.name AS dst, "
            "       coalesce(r2.confidence, 0.4) AS weight, 2 AS hop "
            "ORDER BY weight DESC "
            "LIMIT $limit"
        )
        statements.append(
            {"statement": hop2_stmt, "parameters": {"story_id": int(story_id), "cast_lc": cast_lc, "limit": cap_limit}}
        )

    payload = {"statements": statements}
    res = _http_post_json(NEO4J_HTTP_URL, payload, headers=_neo4j_headers())
    results = res.get("results") if isinstance(res.get("results"), list) else []
    edges: List[Dict[str, Any]] = []
    for part in results:
        if not isinstance(part, dict):
            continue
        rows = part.get("data") if isinstance(part.get("data"), list) else []
        for row in rows:
            row_data = row.get("row") if isinstance(row, dict) and isinstance(row.get("row"), list) else []
            if len(row_data) < 5:
                continue
            src = str(row_data[0] or "").strip()
            rel = str(row_data[1] or "").strip()
            dst = str(row_data[2] or "").strip()
            weight = _clamp(_safe_float(row_data[3], 0.0), 0.0, 1.0)
            hop = int(_safe_float(row_data[4], 1.0))
            if not src or not rel or not dst:
                continue
            edges.append({"src": src, "rel": rel, "dst": dst, "weight": round(weight, 6), "hop": 2 if hop >= 2 else 1})
    # Dedup by triple, keep strongest weight then lower hop.
    merged: Dict[str, Dict[str, Any]] = {}
    for e in edges:
        key = f"{str(e['src']).lower()}|{str(e['rel']).lower()}|{str(e['dst']).lower()}"
        prev = merged.get(key)
        if prev is None or float(e["weight"]) > float(prev["weight"]) or int(e["hop"]) < int(prev["hop"]):
            merged[key] = e
    out = list(merged.values())
    out.sort(key=lambda x: (int(x["hop"]), -float(x["weight"]), str(x["src"]), str(x["dst"])))
    return out[:cap_limit]


def _predicate_to_rel_type(predicate: str) -> str:
    raw = re.sub(r"[^A-Za-z0-9]+", "_", str(predicate or "").strip()).upper().strip("_")
    if not raw:
        raw = "RELATED_TO"
    return f"REL_{raw[:48]}"


def _entity_type(value: Any) -> str:
    t = str(value or "").strip().upper()
    return t if t in ("PERSON", "LOCATION", "ORG", "ITEM", "OTHER") else "OTHER"


def _neo4j_bootstrap_schema() -> None:
    statements = [
        "CREATE CONSTRAINT entity_identity IF NOT EXISTS FOR (e:Entity) REQUIRE (e.story_id, e.name_lc) IS UNIQUE",
        "CREATE INDEX entity_type_idx IF NOT EXISTS FOR (e:Entity) ON (e.entity_type)",
    ]
    payload = {"statements": [{"statement": s, "parameters": {}} for s in statements]}
    _http_post_json(NEO4J_HTTP_URL, payload, headers=_neo4j_headers())


def _neo4j_upsert_projection(story_id: int, facts: List[Dict[str, Any]]) -> Dict[str, Any]:
    skipped = 0
    relation_types: Dict[str, int] = {}
    rows: List[Dict[str, Any]] = []
    for fact in facts[:500]:
        if not isinstance(fact, dict):
            skipped += 1
            continue
        subject = str(fact.get("subject") or "").strip()
        predicate = str(fact.get("predicate") or "").strip()
        obj = str(fact.get("object") or "").strip()
        if not subject or not predicate or not obj:
            skipped += 1
            continue
        rel_type = _predicate_to_rel_type(predicate)
        rows.append({
            "story_id": int(story_id),
            "subject": subject,
            "predicate": predicate,
            "object": obj,
            "rel_type": rel_type,
            "subject_entity_type": _entity_type(fact.get("subject_entity_type", fact.get("entity_type"))),
            "object_entity_type": _entity_type(fact.get("object_entity_type", "OTHER")),
            "classification": str(fact.get("classification") or "STATIC").strip().upper(),
            "confidence": float(fact.get("confidence") or 0.0),
            "is_static": bool(fact.get("is_static", True)),
        })
        relation_types[rel_type] = relation_types.get(rel_type, 0) + 1

    if not rows:
        return {"upserted": 0, "skipped": skipped, "relation_types": relation_types}

    # Batch by rel_type — Neo4j requires static relationship type names, so we
    # group rows that share the same rel_type and issue one UNWIND per group.
    by_rel: Dict[str, List[Dict[str, Any]]] = {}
    for row in rows:
        by_rel.setdefault(row["rel_type"], []).append(row)

    statements = []
    for rel_type, group in by_rel.items():
        stmt = f"""
        UNWIND $rows AS r
        MERGE (s:Entity {{story_id:r.story_id, name_lc:toLower(r.subject)}})
        ON CREATE SET s.name = r.subject
        SET s.entity_type = r.subject_entity_type, s.updated_at = datetime()
        MERGE (o:Entity {{story_id:r.story_id, name_lc:toLower(r.object)}})
        ON CREATE SET o.name = r.object
        SET o.entity_type = r.object_entity_type, o.updated_at = datetime()
        MERGE (s)-[rel:{rel_type}]->(o)
        SET rel.predicate = r.predicate,
            rel.classification = r.classification,
            rel.confidence = r.confidence,
            rel.is_static = r.is_static,
            rel.source = 'historian_projection',
            rel.updated_at = datetime()
        """
        statements.append({"statement": stmt, "parameters": {"rows": group}})

    _http_post_json(NEO4J_HTTP_URL, {"statements": statements}, headers=_neo4j_headers())
    return {"upserted": len(rows), "skipped": skipped, "relation_types": relation_types}


class HistorianBridgeHandler(BaseHTTPRequestHandler):
    def log_message(self, format: str, *args) -> None:
        return

    def do_GET(self) -> None:
        if self.path == "/healthz":
            _json_response(self, 200, {"ok": True, "service": "historian-mcp-bridge"})
            return
        _json_response(self, 404, {"ok": False, "error": "NOT_FOUND"})

    def do_POST(self) -> None:
        if self.path == "/v1/historian/qdrant-search":
            try:
                payload = _read_json(self)
                similarity, top_matches, detail = _qdrant_semantic_search(payload)
                _json_response(
                    self,
                    200,
                    {
                        "ok": True,
                        "style_similarity": similarity,
                        "top_matches": top_matches,
                        "detail": detail,
                    },
                )
            except (URLError, TimeoutError, ValueError, OSError, json.JSONDecodeError) as err:
                _json_response(self, 200, {"ok": False, "style_similarity": 0.0, "top_matches": [], "error": str(err)[:240]})
            return

        if self.path == "/v1/historian/qdrant-semantic-search":
            try:
                payload = _read_json(self)
                matches, detail = _qdrant_semantic_matches(payload)
                _json_response(
                    self,
                    200,
                    {
                        "ok": True,
                        "matches": matches,
                        "detail": detail,
                    },
                )
            except (URLError, TimeoutError, ValueError, OSError, json.JSONDecodeError) as err:
                _json_response(self, 200, {"ok": False, "matches": [], "error": str(err)[:240]})
            return

        if self.path == "/v1/historian/neo4j-lineage":
            payload = _read_json(self)
            candidate_facts = payload.get("candidate_facts") if isinstance(payload.get("candidate_facts"), list) else []
            try:
                _neo4j_ping()
                conflicts = _neo4j_lineage_conflicts(candidate_facts)
                _json_response(self, 200, {"ok": True, "lineage_conflicts": conflicts})
            except (URLError, TimeoutError, ValueError, OSError, json.JSONDecodeError) as err:
                _json_response(self, 200, {"ok": False, "lineage_conflicts": [], "error": str(err)[:240]})
            return

        if self.path == "/v1/historian/neo4j-neighborhood":
            payload = _read_json(self)
            story_id = int(payload.get("story_id") or 0)
            cast = payload.get("cast") if isinstance(payload.get("cast"), list) else []
            depth = int(payload.get("depth") or 2)
            limit = int(payload.get("limit") or 15)
            if story_id <= 0:
                _json_response(self, 400, {"ok": False, "error": "INVALID_STORY_ID"})
                return
            try:
                _neo4j_ping()
                edges = _neo4j_neighborhood(story_id=story_id, cast=cast, limit=limit, depth=depth)
                _json_response(self, 200, {"ok": True, "edges": edges})
            except (URLError, TimeoutError, ValueError, OSError, json.JSONDecodeError) as err:
                _json_response(self, 200, {"ok": False, "edges": [], "error": str(err)[:240]})
            return

        if self.path == "/v1/historian/neo4j-bootstrap":
            try:
                _neo4j_bootstrap_schema()
                _json_response(self, 200, {"ok": True, "status": "BOOTSTRAPPED"})
            except (URLError, TimeoutError, ValueError, OSError, json.JSONDecodeError) as err:
                _json_response(self, 200, {"ok": False, "status": "ERROR", "error": str(err)[:240]})
            return

        if self.path == "/v1/historian/neo4j-upsert":
            payload = _read_json(self)
            story_id = int(payload.get("story_id") or 0)
            facts = payload.get("facts") if isinstance(payload.get("facts"), list) else []
            if story_id <= 0:
                _json_response(self, 400, {"ok": False, "error": "INVALID_STORY_ID"})
                return
            try:
                _neo4j_bootstrap_schema()
                result = _neo4j_upsert_projection(story_id, facts)
                _json_response(self, 200, {"ok": True, **result})
            except (URLError, TimeoutError, ValueError, OSError, json.JSONDecodeError) as err:
                _json_response(self, 200, {"ok": False, "error": str(err)[:240], "upserted": 0, "skipped": 0})
            return

        _json_response(self, 404, {"ok": False, "error": "NOT_FOUND"})


def main() -> None:
    server = HTTPServer((HOST, PORT), HistorianBridgeHandler)
    print(f"[historian-mcp-bridge] listening on {HOST}:{PORT}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
