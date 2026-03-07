# Historian Neo4j Projection Runbook

## Scope

Projection layer from approved Historian artifacts into Neo4j graph (ground truth level-2 for writing support).

## Preconditions

1. `HISTORIAN_NEO4J_ENABLED=1`
2. `HISTORIAN_MCP_BASE_URL` points to historian bridge (local: `http://localhost:8090`)
3. Neo4j credentials in bridge env are valid.
4. Approved snapshots exist (MEMORY_ROLLUP reads approved lane only).

## What Runs

1. `MEMORY_ROLLUP` builds milestone from approved snapshots.
2. Worker calls bridge `/v1/historian/neo4j-upsert`.
3. Bridge bootstraps schema if needed:
   - unique constraint `(story_id, name_lc)` on `:Entity`
   - index on `entity_type`
4. Static facts are upserted as graph relationships.

## Verification

1. Inspect `ingest_task.result_json.neo4j_projection` for MEMORY_ROLLUP task.
2. Check status values:
   - `ok`: projection success
   - `disabled`: feature/env off
   - `error`: bridge/neo4j request failed
3. In Neo4j Browser:
   - `MATCH (e:Entity) RETURN count(e);`
   - `MATCH (a:Entity)-[r]->(b:Entity) RETURN count(r);`

## Common Failures

1. `HISTORIAN_MCP_BASE_URL_MISSING`
2. bridge unreachable/timeouts
3. Neo4j auth mismatch
4. No approved snapshots (projection is skipped by design)

## Recovery

1. Restart bridge container/service.
2. Validate Neo4j health and auth.
3. Re-run MEMORY_ROLLUP for target scope.
4. Re-check `neo4j_projection` block in task result JSON.
