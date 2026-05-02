BEGIN;

-- Add arc_id to story_chapter to persist assignment outside of map versions
ALTER TABLE public.story_chapter 
  ADD COLUMN IF NOT EXISTS arc_id bigint REFERENCES public.story_arc(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_story_chapter_arc_id ON public.story_chapter(arc_id);

-- Migration logic: attempt to hydrate from the LATEST committed map version if possible
-- This is a 'best effort' sync for existing data
UPDATE public.story_chapter sc
SET arc_id = sm.arc_id
FROM public.story_scene_map sm
JOIN public.story_map_version mv ON mv.id = sm.map_version_id
WHERE sc.story_id = mv.story_id
  AND sc.chapter_id = sm.chapter_id
  AND mv.status = 'committed'
  AND mv.id = (
    SELECT id FROM public.story_map_version 
    WHERE story_id = sc.story_id AND status = 'committed' 
    ORDER BY created_at DESC LIMIT 1
  )
  AND sm.arc_id IS NOT NULL;

COMMIT;
