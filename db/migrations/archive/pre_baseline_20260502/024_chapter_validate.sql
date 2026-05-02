BEGIN;

CREATE TABLE IF NOT EXISTS public.validate_rule_feedback (
    id          bigserial PRIMARY KEY,
    story_id    bigint NOT NULL REFERENCES public.story_series(id) ON DELETE CASCADE,
    chapter_id  text NULL,
    pattern     text NOT NULL,
    description text NULL,
    severity    text NOT NULL DEFAULT 'warning',
    created_by  text NOT NULL DEFAULT 'ui',
    active      boolean NOT NULL DEFAULT true,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT validate_rule_feedback_severity_check CHECK (
        severity IN ('error', 'warning', 'info')
    )
);

CREATE INDEX IF NOT EXISTS validate_rule_feedback_story_active_idx
    ON public.validate_rule_feedback (story_id, active, created_at DESC);

CREATE INDEX IF NOT EXISTS validate_rule_feedback_story_chapter_idx
    ON public.validate_rule_feedback (story_id, chapter_id)
    WHERE chapter_id IS NOT NULL;

COMMIT;
