export type ShelfScope = "all" | "published";

export type ShelfItem = {
  slug: string;
  title: string;
  library_status: "draft" | "published" | "archived" | "private";
  summary_md: string | null;
  cover_image_path: string | null;
  updated_at: string;
  tags: string[];
  cautions: string[];
};
