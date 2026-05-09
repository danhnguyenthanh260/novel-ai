CREATE TABLE IF NOT EXISTS public.assistant_conversation (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    story_id bigint NOT NULL,
    chapter_id text,
    workspace text DEFAULT 'write_assistant'::text NOT NULL,
    title text,
    summary text,
    status text DEFAULT 'active'::text NOT NULL,
    state_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT assistant_conversation_pkey PRIMARY KEY (id),
    CONSTRAINT assistant_conversation_status_check CHECK ((status = ANY (ARRAY['active'::text, 'archived'::text]))),
    CONSTRAINT assistant_conversation_workspace_check CHECK (workspace = 'write_assistant'::text),
    CONSTRAINT assistant_conversation_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.story_series(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.assistant_message (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid NOT NULL,
    role text NOT NULL,
    block_type text,
    content text DEFAULT ''::text NOT NULL,
    metadata_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    sequence_no integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT assistant_message_pkey PRIMARY KEY (id),
    CONSTRAINT assistant_message_role_check CHECK ((role = ANY (ARRAY['user'::text, 'assistant'::text, 'system'::text, 'tool'::text, 'workflow'::text]))),
    CONSTRAINT assistant_message_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.assistant_conversation(id) ON DELETE CASCADE,
    CONSTRAINT assistant_message_sequence_uniq UNIQUE (conversation_id, sequence_no)
);

CREATE INDEX IF NOT EXISTS assistant_conversation_story_workspace_updated_idx
    ON public.assistant_conversation USING btree (story_id, workspace, updated_at DESC);

CREATE INDEX IF NOT EXISTS assistant_conversation_story_chapter_updated_idx
    ON public.assistant_conversation USING btree (story_id, chapter_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS assistant_message_conversation_sequence_idx
    ON public.assistant_message USING btree (conversation_id, sequence_no ASC);
