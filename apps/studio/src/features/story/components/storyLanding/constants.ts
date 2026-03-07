export const RR_GENRES = [
    "Action",
    "Adventure",
    "Comedy",
    "Contemporary",
    "Drama",
    "Fantasy",
    "Historical",
    "Horror",
    "Mystery",
    "Psychological",
    "Romance",
    "Satire",
    "Sci-fi",
    "Slice of Life",
    "Tragedy",
] as const;

export const RR_TAGS = [
    "LitRPG",
    "Progression Fantasy",
    "Isekai / Portal Fantasy",
    "Grimdark",
    "Xianxia / Wuxia",
    "Dungeon",
    "Strong Lead",
    "Anti-Hero Lead",
    "Female Lead",
    "Male Lead",
    "Artificial Intelligence",
    "Time Travel",
    "Virtual Reality",
    "Cultivation",
    "Cyberpunk",
    "Steampunk",
    "Urban Fantasy",
] as const;

export const RR_WARNINGS = [
    "Graphic Violence",
    "Strong Language",
    "Sexual Content",
    "Gore",
    "Traumatizing Content",
] as const;

export type RRGenre = (typeof RR_GENRES)[number];
export type RRTag = (typeof RR_TAGS)[number];
export type RRWarning = (typeof RR_WARNINGS)[number];
