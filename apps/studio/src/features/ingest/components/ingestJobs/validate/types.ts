export type ValidateWarning = {
    code: string;
    severity: "error" | "warning" | "info";
    location: {
        char_offset: number | null;
        context_excerpt: string | null;
    };
    note: string;
};

export type ValidateReport = {
    ok: boolean;
    warning_count: number;
    error_count: number;
    warnings: ValidateWarning[];
    custom_matches: ValidateWarning[];
    llm_analysis: string | null;
    llm_issues: ValidateWarning[];
};

export type ValidateChapterReport = {
    task_id: number;
    task_type?: string | null;
    source_path: string | null;
    seq_no: number;
    status: string;
    chapter_id?: string | null;
    report: ValidateReport | null;
};

export type ValidateCustomRule = {
    id: number;
    chapter_id: string | null;
    pattern: string;
    description: string | null;
    severity: "error" | "warning" | "info";
    active: boolean;
    created_at: string;
};
