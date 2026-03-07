SELECT id, story_id, context_type, rule_text
FROM public.dictionary_rule
WHERE rule_text ILIKE '%These markers serve%';
