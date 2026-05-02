-- Migration: Moltbook Foundation Tables
-- Created: 2026-02-20

-- Narrative: Posts
CREATE TABLE IF NOT EXISTS public.narrative_moltbook_post_log (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    submolt TEXT NOT NULL,
    post_id TEXT NOT NULL,
    author TEXT NOT NULL,
    title TEXT,
    content_hash TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_narrative_moltbook_post_log_uniq ON public.narrative_moltbook_post_log(submolt, post_id);

-- Narrative: Comments
CREATE TABLE IF NOT EXISTS public.narrative_moltbook_comment_log (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    post_id TEXT NOT NULL,
    comment_id TEXT NOT NULL,
    parent_id TEXT,
    content TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Narrative: Interactions
CREATE TABLE IF NOT EXISTS public.narrative_moltbook_interaction_log (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    target_id TEXT NOT NULL,
    target_type TEXT NOT NULL, -- 'POST' or 'COMMENT'
    my_action TEXT NOT NULL, -- 'REPLY', 'UPVOTE', 'DOWNVOTE', 'IGNORE'
    sentiment TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Canon: Agent Profile / Allies
CREATE TABLE IF NOT EXISTS public.canon_moltbook_agent_profile (
    agent_name TEXT PRIMARY KEY,
    ally_score FLOAT DEFAULT 0.0,
    labels JSONB DEFAULT '{}'::jsonb,
    notes TEXT,
    last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Metrics: Run stats
CREATE TABLE IF NOT EXISTS public.metrics_moltbook_run (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tick_id UUID NOT NULL,
    actions_taken INTEGER DEFAULT 0,
    rate_limited_count INTEGER DEFAULT 0,
    verify_fail_count INTEGER DEFAULT 0,
    errors JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
