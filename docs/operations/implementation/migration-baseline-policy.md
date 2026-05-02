# Migration Baseline Policy

Created at: 2026-05-02 UTC
Issue: #13

## Purpose

The project now uses one current-schema baseline migration for fresh local setup. This is a personal-project reset of the active migration path, not an enterprise compatibility migration.

## Active Path

- Active migrations live directly in `db/migrations/`.
- Fresh databases apply `db/migrations/*.sql` in filename order.
- `db/migrations/000_baseline_20260502.sql` is the first active migration and represents the intended schema after chapter-first V3 stabilization.
- Future migrations must live beside the baseline and sort after it.

## Archived History

Historical pre-baseline migrations were moved to:

```text
db/migrations/archive/pre_baseline_20260502/
```

The archive is reference-only. It should not be included by migration runners or setup commands. Keep the archive until #3 and #5 both ship; after those contracts stabilize, create a small cleanup task to decide whether to delete the archive or keep it permanently.

## Verification Contract

Before merging a baseline update:

1. Apply the baseline to an empty test database with `ON_ERROR_STOP=1`.
2. Apply all post-baseline migrations, if any exist.
3. Query runtime-sensitive constraints and indexes for:
   - `ingest_job`
   - `ingest_task`
   - `pipeline_node_event`
   - `chapter_draft`
   - `chapter_ledger`
   - `story_milestone`
4. Prove the chapter-first V3 runtime chain on the fresh baseline database:

```text
CHAPTER_WRITE_V3 -> CHAPTER_LEDGER_EXTRACT -> MEMORY_ROLLUP_V3
```

## Existing Databases

Existing personal databases are not migrated automatically by this policy. Recreate or reset them intentionally when needed. Do not run destructive cleanup against a database unless the target connection string and data-deletion intent are explicit.
