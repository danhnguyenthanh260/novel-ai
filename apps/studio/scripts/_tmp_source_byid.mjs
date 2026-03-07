import { Client } from "pg";
const db = new Client({ connectionString: process.env.DATABASE_URL || "postgresql://novel:novelpass@localhost:5433/novel" });
await db.connect();
const q = `
SELECT sd.id::text AS source_doc_id,
       ss.slug,
       sd.created_at,
       sd.raw_text_sha256,
       sd.char_len,
       sd.origin
FROM public.source_doc sd
JOIN public.story_series ss ON ss.id = sd.story_id
WHERE sd.id::text IN ('e3e4b4e3-ceb1-4caa-91ef-7c22c4adde16','9a46786f-9ac4-4666-b2d7-80409cd72d50','66de1eb9-0cd5-4f57-b9b6-3b3d08989cf2')
ORDER BY sd.created_at DESC`;
console.log(JSON.stringify((await db.query(q)).rows, null, 2));
await db.end();
