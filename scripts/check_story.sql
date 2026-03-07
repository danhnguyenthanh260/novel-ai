SELECT id, slug, title FROM public.story_series WHERE slug = 'the_subcurrent';
SELECT id, story_id, doc_type, is_stable, version, origin FROM public.source_doc WHERE story_id = (SELECT id FROM public.story_series WHERE slug = 'the_subcurrent') AND doc_type = 'ingest_chapter' AND is_stable = true;
SELECT story_id, chapter_id, updated_at FROM public.narrative_chapter_staging WHERE story_id = (SELECT id FROM public.story_series WHERE slug = 'the_subcurrent');
SELECT story_id, chapter_id, COUNT(*) as scenes FROM public.narrative_scene WHERE story_id = (SELECT id FROM public.story_series WHERE slug = 'the_subcurrent') GROUP BY story_id, chapter_id;
