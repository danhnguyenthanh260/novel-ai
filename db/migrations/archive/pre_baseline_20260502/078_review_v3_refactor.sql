-- Migration: 078_review_v3_refactor.sql
-- Goal: Extend Review System to support Authoring Core V3 (Chapter-First)

BEGIN;

-- 1. Add Chapter-level fields to review_request
ALTER TABLE public.review_request
ADD COLUMN IF NOT EXISTS chapter_id text,
ADD COLUMN IF NOT EXISTS is_v3 boolean DEFAULT false;

-- 2. Add Status and Patch support to chapter_continuity_issue if missing
ALTER TABLE public.chapter_continuity_issue
ADD COLUMN IF NOT EXISTS status text DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'RESOLVED_PATCHED', 'RESOLVED_MANUAL', 'IGNORED'));

-- 3. Add discrete patch fields to allow easy UI selection & application
ALTER TABLE public.chapter_continuity_issue
ADD COLUMN IF NOT EXISTS patch_suggestion text,
ADD COLUMN IF NOT EXISTS auto_patch_available boolean DEFAULT false;

COMMIT;
