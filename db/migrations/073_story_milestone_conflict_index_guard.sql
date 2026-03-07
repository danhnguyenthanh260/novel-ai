BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS story_milestone_story_range_source_hash_uniq
  ON public.story_milestone(story_id, chapter_from, chapter_to, source_hash)
  WHERE source_hash IS NOT NULL AND source_hash <> '';

COMMIT;
