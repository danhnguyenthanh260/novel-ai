-- Migration: 077_chapter_first_core.sql
-- Goal: Establish Foundation Schema for Authoring Core V3 (Chapter-First)
-- Objective: Separate Chapter Prose from Scene-based logic and provide Ledger-based state tracking.

BEGIN;

-- 1. Create Chapter Draft Table (Source of Truth for Chapter Prose)
CREATE TABLE IF NOT EXISTS public.chapter_draft (
    id              bigserial PRIMARY KEY,
    story_id        bigint NOT NULL,
    chapter_id      text NOT NULL,
    version_no      integer NOT NULL DEFAULT 1,
    full_text       text NOT NULL,
    scene_markers   jsonb NOT NULL DEFAULT '[]'::jsonb, -- [{ "idx": number, "title": string, "offset": number }]
    status          text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'FINAL', 'ARCHIVED')),
    created_by      text NOT NULL DEFAULT 'system',
    created_at      timestamp without time zone NOT NULL DEFAULT now(),
    updated_at      timestamp without time zone NOT NULL DEFAULT now(),

    CONSTRAINT chapter_draft_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.story_series(id) ON DELETE CASCADE,
    CONSTRAINT uq_chapter_draft_version UNIQUE(story_id, chapter_id, version_no)
);

CREATE INDEX IF NOT EXISTS idx_chapter_draft_lookup ON public.chapter_draft(story_id, chapter_id, status);

-- 2. Create Chapter Ledger Table (Source of Truth for Narrative Delta)
CREATE TABLE IF NOT EXISTS public.chapter_ledger (
    id                  bigserial PRIMARY KEY,
    story_id            bigint NOT NULL,
    chapter_id          text NOT NULL,
    draft_id            bigint, -- Optional link to the specific draft that generated this ledger
    added_facts         jsonb NOT NULL DEFAULT '[]'::jsonb, -- [{ "id": string, "fact": string, "confidence": number }]
    modified_states     jsonb NOT NULL DEFAULT '{}'::jsonb, -- { "character_id": { "prop": "value" } }
    resolved_loops      jsonb NOT NULL DEFAULT '[]'::jsonb, -- [string]
    unresolved_loops    jsonb NOT NULL DEFAULT '[]'::jsonb, -- [{ "description": string, "urgency": number }]
    is_stale            boolean NOT NULL DEFAULT false,
    stale_reason        text,
    created_at          timestamp without time zone NOT NULL DEFAULT now(),
    updated_at          timestamp without time zone NOT NULL DEFAULT now(),

    CONSTRAINT chapter_ledger_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.story_series(id) ON DELETE CASCADE,
    CONSTRAINT chapter_ledger_draft_id_fkey FOREIGN KEY (draft_id) REFERENCES public.chapter_draft(id) ON DELETE SET NULL,
    CONSTRAINT uq_chapter_ledger_chapter UNIQUE(story_id, chapter_id)
);

CREATE INDEX IF NOT EXISTS idx_chapter_ledger_story ON public.chapter_ledger(story_id);

-- 3. Create Continuity Issue Table (Validation Audit Trail)
CREATE TABLE IF NOT EXISTS public.chapter_continuity_issue (
    id              bigserial PRIMARY KEY,
    story_id        bigint NOT NULL,
    chapter_id      text NOT NULL,
    issue_type      text NOT NULL, -- e.g., 'LOGIC_CONFLICT', 'STYLE_DRIFT'
    severity        text NOT NULL CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    description     text NOT NULL,
    payload         jsonb NOT NULL DEFAULT '{}'::jsonb, -- { "evidence": string, "suggested_fix": string }
    is_resolved     boolean NOT NULL DEFAULT false,
    created_at      timestamp without time zone NOT NULL DEFAULT now(),

    CONSTRAINT chapter_continuity_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.story_series(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_chapter_continuity_lookup ON public.chapter_continuity_issue(story_id, chapter_id);

COMMIT;
