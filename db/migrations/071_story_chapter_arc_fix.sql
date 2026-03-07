BEGIN;

ALTER TABLE public.story_chapter
  ADD COLUMN IF NOT EXISTS arc_id bigint NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'story_chapter_arc_id_fkey'
  ) THEN
    ALTER TABLE public.story_chapter
      ADD CONSTRAINT story_chapter_arc_id_fkey
      FOREIGN KEY (arc_id)
      REFERENCES public.story_arc(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_story_chapter_story_arc
  ON public.story_chapter(story_id, arc_id);

-- Best-effort one-time backfill from latest mapped arc assignment per chapter.
WITH latest_map_arc AS (
  SELECT DISTINCT ON (sc.story_id, sc.chapter_id)
    sc.story_id,
    sc.chapter_id,
    sm.arc_id
  FROM public.story_chapter sc
  JOIN public.story_map_version mv
    ON mv.story_id = sc.story_id
  JOIN public.story_scene_map sm
    ON sm.map_version_id = mv.id
   AND sm.chapter_id = sc.chapter_id
  WHERE sm.arc_id IS NOT NULL
  ORDER BY
    sc.story_id,
    sc.chapter_id,
    mv.created_at DESC,
    mv.id DESC,
    sm.id DESC
)
UPDATE public.story_chapter sc
SET arc_id = lma.arc_id,
    updated_at = now()
FROM latest_map_arc lma
WHERE sc.story_id = lma.story_id
  AND sc.chapter_id = lma.chapter_id
  AND sc.arc_id IS NULL;

COMMIT;

