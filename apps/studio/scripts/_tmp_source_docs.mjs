import { Client } from "pg";
const db = new Client({ connectionString: process.env.DATABASE_URL || "postgresql://novel:novelpass@localhost:5433/novel" });
await db.connect();
const q = `
SELECT sd.id::text AS source_doc_id,
       sd.created_at,
       sd.raw_text_sha256,
       sd.char_len,
       sd.origin->>'chapter_id' AS chapter_id,
       sd.origin->>'source_type' AS source_type,
       sd.origin->>'source_role' AS source_role,
       sd.origin->>'source_path' AS source_path
FROM public.source_doc sd
JOIN public.story_series ss ON ss.id = sd.story_id
WHERE ss.slug='the_subcurrent'
  AND COALESCE(sd.origin->>'chapter_id', replace(sd.origin->>'source_path','chapter:',''))='ch02'
ORDER BY sd.created_at DESC
LIMIT 20`;
console.log(JSON.stringify((await db.query(q)).rows, null, 2));
await db.end();
