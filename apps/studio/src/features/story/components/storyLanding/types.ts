export type PublicDetail = {
  slug: string;
  title: string;
  library_status: "draft" | "published" | "archived" | "private";
  created_at: string;
  updated_at: string;
  description_md: string | null;
  author_note_md: string | null;
  summary_md: string | null;
  cover_image_path: string | null;
  background_image_path: string | null;
  caution_other_md: string | null;
  tags: string[];
  cautions: string[];
  gallery: Array<{ id: number; path: string; caption_md: string | null; sort_order: number }>;
};

export type ArcItem = {
  id: number;
  name: string;
  slug: string | null;
  kind?: string | null;
  order_no?: number;
};

export type ChapterItem = {
  chapter_id: string;
  title?: string;
  arc_id?: number | null;
  arc_name?: string | null;
  scene_count: number;
  first_scene_idx: number;
  updated_at: string;
  is_stable: boolean;
  version: number | null;
};
