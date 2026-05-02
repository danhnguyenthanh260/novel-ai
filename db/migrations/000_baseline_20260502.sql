-- Baseline migration generated for #13 on 2026-05-02.
-- Fresh personal-project databases apply this file first, then any post-baseline migrations.
-- Historical migrations are archived under db/migrations/archive/pre_baseline_20260502/.
--
-- PostgreSQL database dump
--

\restrict B1aiIVXi3u2tPO2RGaa3sCuA1UJaYnbNpknIoOZdvpaYaOll4b5fezR0Gvl2fCa

-- Dumped from database version 15.15 (Debian 15.15-1.pgdg13+1)
-- Dumped by pg_dump version 16.13 (Ubuntu 16.13-0ubuntu0.24.04.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS public;


--
-- Name: author_style_profile_touch_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.author_style_profile_touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;


--
-- Name: core_memory_vetting_state_touch_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.core_memory_vetting_state_touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;


--
-- Name: enqueue_memory_enrich_task_v1(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enqueue_memory_enrich_task_v1() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  INSERT INTO public.memory_enrich_task
    (story_id, scene_id, scene_version_id, algo_version, status)
  VALUES
    (NEW.story_id, NEW.scene_id, NEW.id, 'memory_v1', 'READY')
  ON CONFLICT (scene_version_id, algo_version) DO NOTHING;
  RETURN NEW;
END;
$$;


--
-- Name: ingest_job_touch_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ingest_job_touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;


--
-- Name: ingest_task_touch_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ingest_task_touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;


--
-- Name: memory_enrich_task_touch_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.memory_enrich_task_touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;


--
-- Name: muse_rules_touch_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.muse_rules_touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;


--
-- Name: scene_version_tsv_update(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.scene_version_tsv_update() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.tsv :=
    setweight(to_tsvector('simple', unaccent(coalesce(NEW.text_content,''))), 'A') ||
    setweight(to_tsvector('simple', unaccent(coalesce(NEW.summary,''))), 'B');
  RETURN NEW;
END;
$$;


--
-- Name: story_beat_touch_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.story_beat_touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;


--
-- Name: story_canon_fact_tsv_update(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.story_canon_fact_tsv_update() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.content_tsv := setweight(to_tsvector('simple', unaccent(coalesce(NEW.content, ''))), 'A');
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;


--
-- Name: story_map_state_touch_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.story_map_state_touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;


--
-- Name: story_scene_map_touch_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.story_scene_map_touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;


--
-- Name: story_style_profile_touch_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.story_style_profile_touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;


--
-- Name: story_worldbuilding_note_tsv_update(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.story_worldbuilding_note_tsv_update() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.content_tsv :=
    setweight(to_tsvector('simple', unaccent(coalesce(NEW.category, ''))), 'A') ||
    setweight(to_tsvector('simple', unaccent(coalesce(NEW.content, ''))), 'A') ||
    setweight(to_tsvector('simple', unaccent(array_to_string(NEW.tags, ' '))), 'B');
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;


--
-- Name: timeline_event_tsv_update(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.timeline_event_tsv_update() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.tsv :=
    setweight(to_tsvector('simple', unaccent(coalesce(NEW.title,''))), 'A') ||
    setweight(to_tsvector('simple', unaccent(coalesce(NEW.body,''))), 'A') ||
    setweight(to_tsvector('simple', unaccent(array_to_string(NEW.tags,' '))), 'B');
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: agent_context_snapshot; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_context_snapshot (
    id bigint NOT NULL,
    story_id bigint NOT NULL,
    chapter_id text,
    snapshot_json jsonb NOT NULL,
    snapshot_hash text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: agent_context_snapshot_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.agent_context_snapshot_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: agent_context_snapshot_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.agent_context_snapshot_id_seq OWNED BY public.agent_context_snapshot.id;


--
-- Name: agent_equipment_slots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_equipment_slots (
    id bigint NOT NULL,
    agent_profile_id bigint NOT NULL,
    story_id bigint NOT NULL,
    slot_type text NOT NULL,
    artifact_ref_type text DEFAULT 'UNKNOWN'::text NOT NULL,
    artifact_id text NOT NULL,
    stats_mod jsonb DEFAULT '{}'::jsonb NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT agent_equipment_slots_slot_type_check CHECK ((slot_type = ANY (ARRAY['DNA'::text, 'WEAPON_PROMPT'::text, 'SKILL_GEM'::text, 'MEMORY_SHARD'::text])))
);


--
-- Name: agent_equipment_slots_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.agent_equipment_slots_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: agent_equipment_slots_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.agent_equipment_slots_id_seq OWNED BY public.agent_equipment_slots.id;


--
-- Name: agent_feedback_loop; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_feedback_loop (
    id bigint NOT NULL,
    story_id bigint NOT NULL,
    chapter_id text,
    agent_name text NOT NULL,
    run_trace_id bigint,
    feedback_source text NOT NULL,
    feedback_type text NOT NULL,
    feedback_text text NOT NULL,
    weight numeric(5,2) DEFAULT 1.0 NOT NULL,
    status text DEFAULT 'ACTIVE'::text NOT NULL,
    created_by text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT agent_feedback_loop_feedback_source_check CHECK ((feedback_source = ANY (ARRAY['HUMAN'::text, 'SUPERVISOR'::text, 'CRITIC'::text, 'SYSTEM'::text]))),
    CONSTRAINT agent_feedback_loop_feedback_type_check CHECK ((feedback_type = ANY (ARRAY['KEEP'::text, 'AVOID'::text, 'FIX'::text, 'RULE'::text]))),
    CONSTRAINT agent_feedback_loop_status_check CHECK ((status = ANY (ARRAY['ACTIVE'::text, 'MUTED'::text, 'ARCHIVED'::text])))
);


--
-- Name: agent_feedback_loop_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.agent_feedback_loop_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: agent_feedback_loop_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.agent_feedback_loop_id_seq OWNED BY public.agent_feedback_loop.id;


--
-- Name: agent_janitor_task; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_janitor_task (
    id bigint NOT NULL,
    story_id bigint NOT NULL,
    job_id bigint NOT NULL,
    chapter_id text,
    status text DEFAULT 'READY'::text NOT NULL,
    retry_count integer DEFAULT 0 NOT NULL,
    available_at timestamp with time zone DEFAULT now() NOT NULL,
    last_error text,
    payload_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT agent_janitor_task_status_check CHECK ((status = ANY (ARRAY['READY'::text, 'RUNNING'::text, 'DONE'::text, 'FAILED'::text])))
);


--
-- Name: agent_janitor_task_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.agent_janitor_task_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: agent_janitor_task_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.agent_janitor_task_id_seq OWNED BY public.agent_janitor_task.id;


--
-- Name: agent_memory_vector; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_memory_vector (
    id bigint NOT NULL,
    story_id bigint NOT NULL,
    chapter_id text,
    agent_name text NOT NULL,
    source_run_trace_id bigint,
    memory_type text NOT NULL,
    memory_text text NOT NULL,
    embedding_json jsonb DEFAULT '[]'::jsonb NOT NULL,
    score numeric(5,2) DEFAULT 0 NOT NULL,
    tags jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT agent_memory_vector_memory_type_check CHECK ((memory_type = ANY (ARRAY['POSITIVE_EXAMPLE'::text, 'NEGATIVE_PATTERN'::text, 'STYLE_ANCHOR'::text])))
);


--
-- Name: agent_memory_vector_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.agent_memory_vector_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: agent_memory_vector_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.agent_memory_vector_id_seq OWNED BY public.agent_memory_vector.id;


--
-- Name: agent_profile_event; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_profile_event (
    id bigint NOT NULL,
    agent_profile_id bigint NOT NULL,
    story_id bigint,
    action text NOT NULL,
    details_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    actor text DEFAULT 'studio'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT agent_profile_event_action_check CHECK ((action = ANY (ARRAY['CREATE_PROFILE'::text, 'SEAL'::text, 'UNSEAL'::text, 'XP_RECALC'::text, 'SLOT_ATTACH'::text, 'SLOT_REPLACE'::text])))
);


--
-- Name: agent_profile_event_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.agent_profile_event_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: agent_profile_event_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.agent_profile_event_id_seq OWNED BY public.agent_profile_event.id;


--
-- Name: agent_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_profiles (
    id bigint NOT NULL,
    species_name text NOT NULL,
    nick_name text DEFAULT ''::text NOT NULL,
    base_dna_id bigint,
    experience_pts bigint DEFAULT 0 NOT NULL,
    level integer DEFAULT 1 NOT NULL,
    is_sealed boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    visual_profile_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT agent_profiles_level_check CHECK (((level >= 1) AND (level <= 100)))
);


--
-- Name: agent_profiles_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.agent_profiles_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: agent_profiles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.agent_profiles_id_seq OWNED BY public.agent_profiles.id;


--
-- Name: agent_prompt_experiment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_prompt_experiment (
    id bigint NOT NULL,
    agent_name text NOT NULL,
    scope text NOT NULL,
    story_id bigint,
    chapter_id text,
    baseline_version_id bigint NOT NULL,
    candidate_version_id bigint NOT NULL,
    traffic_percent integer NOT NULL,
    status text DEFAULT 'RUNNING'::text NOT NULL,
    start_at timestamp with time zone DEFAULT now() NOT NULL,
    end_at timestamp with time zone,
    CONSTRAINT agent_prompt_experiment_scope_check CHECK ((scope = ANY (ARRAY['global'::text, 'story'::text, 'chapter'::text]))),
    CONSTRAINT agent_prompt_experiment_status_check CHECK ((status = ANY (ARRAY['RUNNING'::text, 'PAUSED'::text, 'COMPLETED'::text, 'ROLLED_BACK'::text]))),
    CONSTRAINT agent_prompt_experiment_traffic_percent_check CHECK (((traffic_percent >= 1) AND (traffic_percent <= 100)))
);


--
-- Name: agent_prompt_experiment_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.agent_prompt_experiment_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: agent_prompt_experiment_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.agent_prompt_experiment_id_seq OWNED BY public.agent_prompt_experiment.id;


--
-- Name: agent_prompt_hydration_trace; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_prompt_hydration_trace (
    id bigint NOT NULL,
    run_trace_id bigint,
    story_id bigint NOT NULL,
    chapter_id text,
    task_id bigint,
    task_type text DEFAULT ''::text NOT NULL,
    agent_name text NOT NULL,
    prompt_version_id bigint,
    context_snapshot_id bigint,
    hydration_inputs_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    hydration_render_steps_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    hydration_output_hash text,
    hydration_output_text text,
    llm_request_meta_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    tokens_prompt_base integer,
    tokens_rules_injected integer,
    tokens_memory_injected integer,
    tokens_feedback_injected integer,
    tokens_truncated integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: agent_prompt_hydration_trace_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.agent_prompt_hydration_trace_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: agent_prompt_hydration_trace_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.agent_prompt_hydration_trace_id_seq OWNED BY public.agent_prompt_hydration_trace.id;


--
-- Name: agent_prompt_profile; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_prompt_profile (
    id bigint NOT NULL,
    agent_name text NOT NULL,
    scope text NOT NULL,
    story_id bigint,
    chapter_id text,
    status text DEFAULT 'ACTIVE'::text NOT NULL,
    created_by text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT agent_prompt_profile_scope_check CHECK ((scope = ANY (ARRAY['global'::text, 'story'::text, 'chapter'::text]))),
    CONSTRAINT agent_prompt_profile_status_check CHECK ((status = ANY (ARRAY['ACTIVE'::text, 'ARCHIVED'::text])))
);


--
-- Name: agent_prompt_profile_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.agent_prompt_profile_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: agent_prompt_profile_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.agent_prompt_profile_id_seq OWNED BY public.agent_prompt_profile.id;


--
-- Name: agent_prompt_version; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_prompt_version (
    id bigint NOT NULL,
    profile_id bigint NOT NULL,
    version_no integer NOT NULL,
    system_prompt text NOT NULL,
    developer_prompt text,
    output_contract_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    guardrail_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    change_note text,
    status text DEFAULT 'DRAFT'::text NOT NULL,
    created_by text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT agent_prompt_version_status_check CHECK ((status = ANY (ARRAY['DRAFT'::text, 'CANARY'::text, 'ACTIVE'::text, 'ARCHIVED'::text])))
);


--
-- Name: agent_prompt_version_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.agent_prompt_version_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: agent_prompt_version_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.agent_prompt_version_id_seq OWNED BY public.agent_prompt_version.id;


--
-- Name: agent_run_trace; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_run_trace (
    id bigint NOT NULL,
    job_id bigint,
    task_id bigint,
    story_id bigint NOT NULL,
    chapter_id text,
    agent_name text NOT NULL,
    prompt_version_id bigint,
    model_name text,
    input_hash text NOT NULL,
    output_hash text,
    latency_ms integer,
    token_in integer,
    token_out integer,
    status text NOT NULL,
    error_code text,
    quality_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    context_snapshot_id bigint,
    rationale_summary text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    strategy_profile_version_id bigint,
    agent_profile_id bigint,
    equipment_snapshot_json jsonb,
    taxonomy_version text,
    rule_pack_version text,
    version_pair_valid boolean DEFAULT true NOT NULL,
    token_key text,
    detection_mode text,
    enforcement_mode text,
    freeze_window_id text,
    frozen_at timestamp with time zone,
    original_detection_mode text,
    original_enforcement_mode text,
    current_detection_mode text,
    current_enforcement_mode text,
    CONSTRAINT agent_run_trace_status_check CHECK ((status = ANY (ARRAY['DONE'::text, 'FAILED'::text, 'TIMEOUT'::text])))
);


--
-- Name: agent_run_trace_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.agent_run_trace_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: agent_run_trace_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.agent_run_trace_id_seq OWNED BY public.agent_run_trace.id;


--
-- Name: agent_tuning_event; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_tuning_event (
    id bigint NOT NULL,
    agent_name text NOT NULL,
    from_version_id bigint,
    to_version_id bigint NOT NULL,
    action text NOT NULL,
    reason text NOT NULL,
    author text NOT NULL,
    approved_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT agent_tuning_event_action_check CHECK ((action = ANY (ARRAY['PROMOTE_CANARY'::text, 'PROMOTE_ACTIVE'::text, 'ROLLBACK'::text, 'ARCHIVE'::text])))
);


--
-- Name: agent_tuning_event_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.agent_tuning_event_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: agent_tuning_event_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.agent_tuning_event_id_seq OWNED BY public.agent_tuning_event.id;


--
-- Name: analysis_delta_report_v1; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.analysis_delta_report_v1 (
    id bigint NOT NULL,
    story_id bigint NOT NULL,
    chapter_id text NOT NULL,
    source_kind text DEFAULT 'writing_analysis'::text NOT NULL,
    source_ref text,
    source_hash text NOT NULL,
    truth_pack_changed boolean DEFAULT true NOT NULL,
    report_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: analysis_delta_report_v1_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.analysis_delta_report_v1_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: analysis_delta_report_v1_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.analysis_delta_report_v1_id_seq OWNED BY public.analysis_delta_report_v1.id;


--
-- Name: author_annotation_v1; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.author_annotation_v1 (
    annotation_id bigint NOT NULL,
    story_id bigint NOT NULL,
    chapter_id text,
    target_type text NOT NULL,
    target_ref text NOT NULL,
    annotation_type text NOT NULL,
    payload_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    priority text DEFAULT 'medium'::text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    effective_from_chapter text,
    effective_to_chapter text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    revoked_at timestamp with time zone,
    supersedes_annotation_id bigint,
    annotation_version integer DEFAULT 1 NOT NULL,
    reason text,
    actor text DEFAULT 'author'::text NOT NULL,
    CONSTRAINT author_annotation_v1_status_check CHECK ((status = ANY (ARRAY['active'::text, 'revoked'::text, 'expired'::text])))
);


--
-- Name: author_annotation_v1_annotation_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.author_annotation_v1_annotation_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: author_annotation_v1_annotation_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.author_annotation_v1_annotation_id_seq OWNED BY public.author_annotation_v1.annotation_id;


--
-- Name: author_style_profile; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.author_style_profile (
    story_id bigint NOT NULL,
    profile_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    sample_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: autowrite_cutover_state_v1; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.autowrite_cutover_state_v1 (
    story_id bigint NOT NULL,
    cutover_stage text DEFAULT 'STAGE_1_SHADOW'::text NOT NULL,
    parity_window_stats jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT autowrite_cutover_state_v1_cutover_stage_check CHECK ((cutover_stage = ANY (ARRAY['STAGE_1_SHADOW'::text, 'STAGE_2_PLANNER'::text, 'STAGE_3_PROSE'::text, 'STAGE_4_LEGACY_RETIRED'::text])))
);


--
-- Name: canon_fact; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.canon_fact (
    id bigint NOT NULL,
    story_id bigint NOT NULL,
    scene_id bigint NOT NULL,
    scene_version_id bigint NOT NULL,
    algo_version text NOT NULL,
    subject text NOT NULL,
    predicate text NOT NULL,
    object text NOT NULL,
    confidence numeric(4,3) DEFAULT 1.000 NOT NULL,
    tags text[] DEFAULT ARRAY[]::text[] NOT NULL,
    source_trace jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    entity_type text,
    classification text,
    is_static boolean,
    is_unreliable boolean DEFAULT false NOT NULL,
    affinity_weight numeric(6,4),
    universe_id text DEFAULT 'main'::text NOT NULL,
    entity_kind text DEFAULT 'individual'::text NOT NULL,
    CONSTRAINT canon_fact_affinity_weight_range_check CHECK (((affinity_weight IS NULL) OR ((affinity_weight >= '-1.0'::numeric) AND (affinity_weight <= 1.0)))),
    CONSTRAINT canon_fact_classification_check CHECK (((classification IS NULL) OR (classification = ANY (ARRAY['STATIC'::text, 'EPHEMERAL'::text, 'META'::text])))),
    CONSTRAINT canon_fact_confidence_check CHECK (((confidence >= (0)::numeric) AND (confidence <= (1)::numeric))),
    CONSTRAINT canon_fact_entity_kind_check CHECK ((entity_kind = ANY (ARRAY['individual'::text, 'collective'::text, 'persona'::text]))),
    CONSTRAINT canon_fact_entity_type_check CHECK (((entity_type IS NULL) OR (entity_type = ANY (ARRAY['PERSON'::text, 'LOCATION'::text, 'ORG'::text, 'ITEM'::text, 'OTHER'::text]))))
);


--
-- Name: canon_fact_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.canon_fact_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: canon_fact_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.canon_fact_id_seq OWNED BY public.canon_fact.id;


--
-- Name: canon_moltbook_agent_profile; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.canon_moltbook_agent_profile (
    agent_name text NOT NULL,
    ally_score double precision DEFAULT 0.0,
    labels jsonb DEFAULT '{}'::jsonb,
    notes text,
    last_seen_at timestamp with time zone DEFAULT now()
);


--
-- Name: chapter_continuity_issue; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chapter_continuity_issue (
    id bigint NOT NULL,
    story_id bigint NOT NULL,
    chapter_id text NOT NULL,
    issue_type text NOT NULL,
    severity text NOT NULL,
    description text NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    is_resolved boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'OPEN'::text,
    patch_suggestion text,
    auto_patch_available boolean DEFAULT false,
    CONSTRAINT chapter_continuity_issue_severity_check CHECK ((severity = ANY (ARRAY['LOW'::text, 'MEDIUM'::text, 'HIGH'::text, 'CRITICAL'::text]))),
    CONSTRAINT chapter_continuity_issue_status_check CHECK ((status = ANY (ARRAY['OPEN'::text, 'RESOLVED_PATCHED'::text, 'RESOLVED_MANUAL'::text, 'IGNORED'::text])))
);


--
-- Name: chapter_continuity_issue_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.chapter_continuity_issue_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: chapter_continuity_issue_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.chapter_continuity_issue_id_seq OWNED BY public.chapter_continuity_issue.id;


--
-- Name: chapter_draft; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chapter_draft (
    id bigint NOT NULL,
    story_id bigint NOT NULL,
    chapter_id text NOT NULL,
    version_no integer DEFAULT 1 NOT NULL,
    full_text text NOT NULL,
    scene_markers jsonb DEFAULT '[]'::jsonb NOT NULL,
    status text DEFAULT 'DRAFT'::text NOT NULL,
    created_by text DEFAULT 'system'::text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    metadata_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT chapter_draft_status_check CHECK ((status = ANY (ARRAY['DRAFT'::text, 'FINAL'::text, 'ARCHIVED'::text])))
);


--
-- Name: chapter_draft_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.chapter_draft_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: chapter_draft_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.chapter_draft_id_seq OWNED BY public.chapter_draft.id;


--
-- Name: chapter_ledger; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chapter_ledger (
    id bigint NOT NULL,
    story_id bigint NOT NULL,
    chapter_id text NOT NULL,
    draft_id bigint,
    added_facts jsonb DEFAULT '[]'::jsonb NOT NULL,
    modified_states jsonb DEFAULT '{}'::jsonb NOT NULL,
    resolved_loops jsonb DEFAULT '[]'::jsonb NOT NULL,
    unresolved_loops jsonb DEFAULT '[]'::jsonb NOT NULL,
    is_stale boolean DEFAULT false NOT NULL,
    stale_reason text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    metadata_json jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- Name: chapter_ledger_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.chapter_ledger_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: chapter_ledger_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.chapter_ledger_id_seq OWNED BY public.chapter_ledger.id;


--
-- Name: core_memory_vetting_event; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.core_memory_vetting_event (
    id bigint NOT NULL,
    story_id bigint NOT NULL,
    source_kind text NOT NULL,
    source_id bigint NOT NULL,
    action text NOT NULL,
    from_status text,
    to_status text NOT NULL,
    note text,
    actor text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT core_memory_vetting_event_action_check CHECK ((action = ANY (ARRAY['APPROVE'::text, 'REJECT'::text, 'RESET_TO_PENDING'::text]))),
    CONSTRAINT core_memory_vetting_event_source_kind_check CHECK ((source_kind = ANY (ARRAY['CANON_FACT'::text, 'TIMELINE_ANCHOR'::text, 'STORY_CANON_FACT'::text]))),
    CONSTRAINT core_memory_vetting_event_to_status_check CHECK ((to_status = ANY (ARRAY['PENDING'::text, 'APPROVED'::text, 'REJECTED'::text])))
);


--
-- Name: core_memory_vetting_event_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.core_memory_vetting_event_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: core_memory_vetting_event_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.core_memory_vetting_event_id_seq OWNED BY public.core_memory_vetting_event.id;


--
-- Name: core_memory_vetting_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.core_memory_vetting_state (
    id bigint NOT NULL,
    story_id bigint NOT NULL,
    source_kind text NOT NULL,
    source_id bigint NOT NULL,
    review_status text DEFAULT 'PENDING'::text NOT NULL,
    review_note text,
    reviewed_by text,
    reviewed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT core_memory_vetting_state_review_status_check CHECK ((review_status = ANY (ARRAY['PENDING'::text, 'APPROVED'::text, 'REJECTED'::text]))),
    CONSTRAINT core_memory_vetting_state_source_kind_check CHECK ((source_kind = ANY (ARRAY['CANON_FACT'::text, 'TIMELINE_ANCHOR'::text, 'STORY_CANON_FACT'::text])))
);


--
-- Name: core_memory_vetting_state_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.core_memory_vetting_state_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: core_memory_vetting_state_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.core_memory_vetting_state_id_seq OWNED BY public.core_memory_vetting_state.id;


--
-- Name: entity_conflict_review; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.entity_conflict_review (
    id bigint NOT NULL,
    story_id bigint NOT NULL,
    chapter_id text,
    entity_key text NOT NULL,
    candidate_values jsonb DEFAULT '[]'::jsonb NOT NULL,
    evidence_refs jsonb DEFAULT '[]'::jsonb NOT NULL,
    authority_scores jsonb DEFAULT '{}'::jsonb NOT NULL,
    conflict_type text NOT NULL,
    severity text DEFAULT 'MEDIUM'::text NOT NULL,
    suggested_resolution jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'REQUIRES_HUMAN_REVIEW'::text NOT NULL,
    resolution_action text,
    resolution_payload jsonb,
    actor text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    resolved_at timestamp with time zone,
    universe_id text DEFAULT 'main'::text NOT NULL,
    entity_kind text DEFAULT 'individual'::text NOT NULL,
    CONSTRAINT entity_conflict_review_entity_kind_check CHECK ((entity_kind = ANY (ARRAY['individual'::text, 'collective'::text, 'persona'::text])))
);


--
-- Name: entity_conflict_review_event; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.entity_conflict_review_event (
    id bigint NOT NULL,
    story_id bigint NOT NULL,
    review_id bigint NOT NULL,
    action text NOT NULL,
    actor text NOT NULL,
    note text,
    payload jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: entity_conflict_review_event_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.entity_conflict_review_event_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: entity_conflict_review_event_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.entity_conflict_review_event_id_seq OWNED BY public.entity_conflict_review_event.id;


--
-- Name: entity_conflict_review_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.entity_conflict_review_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: entity_conflict_review_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.entity_conflict_review_id_seq OWNED BY public.entity_conflict_review.id;


--
-- Name: entity_merge_challenge_v1; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.entity_merge_challenge_v1 (
    id bigint NOT NULL,
    story_id bigint NOT NULL,
    chapter_id text,
    challenged_entity_id text NOT NULL,
    conflicting_surface_forms jsonb DEFAULT '[]'::jsonb NOT NULL,
    challenge_reason text NOT NULL,
    confidence numeric(5,4) DEFAULT 0 NOT NULL,
    affected_fact_refs jsonb DEFAULT '[]'::jsonb NOT NULL,
    recommended_action text DEFAULT 'REVIEW'::text NOT NULL,
    severity text DEFAULT 'medium'::text NOT NULL,
    status text DEFAULT 'OPEN'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT entity_merge_challenge_v1_severity_check CHECK ((severity = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'critical'::text]))),
    CONSTRAINT entity_merge_challenge_v1_status_check CHECK ((status = ANY (ARRAY['OPEN'::text, 'ACKNOWLEDGED'::text, 'RESOLVED'::text, 'IGNORED'::text])))
);


--
-- Name: entity_merge_challenge_v1_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.entity_merge_challenge_v1_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: entity_merge_challenge_v1_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.entity_merge_challenge_v1_id_seq OWNED BY public.entity_merge_challenge_v1.id;


--
-- Name: entity_resolution_snapshot_v1; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.entity_resolution_snapshot_v1 (
    id bigint NOT NULL,
    story_id bigint NOT NULL,
    chapter_id text NOT NULL,
    chapter_content_hash text NOT NULL,
    relevant_entity_snapshot_hash text NOT NULL,
    author_annotation_hash text NOT NULL,
    identity_policy_hash text NOT NULL,
    cache_key text NOT NULL,
    snapshot_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'READY'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT entity_resolution_snapshot_v1_status_check CHECK ((status = ANY (ARRAY['READY'::text, 'STALE'::text, 'FAILED'::text])))
);


--
-- Name: entity_resolution_snapshot_v1_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.entity_resolution_snapshot_v1_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: entity_resolution_snapshot_v1_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.entity_resolution_snapshot_v1_id_seq OWNED BY public.entity_resolution_snapshot_v1.id;


--
-- Name: entity_truth_overlay; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.entity_truth_overlay (
    id bigint NOT NULL,
    story_id bigint NOT NULL,
    entity_key text NOT NULL,
    canonical_type text NOT NULL,
    canonical_role text NOT NULL,
    confidence numeric(5,4) DEFAULT 1.0 NOT NULL,
    source_of_truth text DEFAULT 'HUMAN_REVIEW'::text NOT NULL,
    reviewed_by text,
    review_note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    universe_id text DEFAULT 'main'::text NOT NULL,
    entity_kind text DEFAULT 'individual'::text NOT NULL,
    parent_collective_id text,
    collective_membership_state jsonb DEFAULT '{}'::jsonb NOT NULL,
    persona_owner_entity_id text,
    CONSTRAINT entity_truth_overlay_entity_kind_check CHECK ((entity_kind = ANY (ARRAY['individual'::text, 'collective'::text, 'persona'::text])))
);


--
-- Name: entity_truth_overlay_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.entity_truth_overlay_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: entity_truth_overlay_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.entity_truth_overlay_id_seq OWNED BY public.entity_truth_overlay.id;


--
-- Name: ingest_job; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ingest_job (
    id bigint NOT NULL,
    story_id bigint NOT NULL,
    created_by text,
    mode text NOT NULL,
    status text NOT NULL,
    config_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    total_tasks integer DEFAULT 0 NOT NULL,
    completed_tasks integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    ingest_run_id uuid,
    split_draft_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    cool_off_seconds integer DEFAULT 60,
    CONSTRAINT ingest_job_mode_check CHECK ((mode = ANY (ARRAY['AUTO_LOCK'::text, 'REVIEW_GATE'::text, 'AUTO_CHAPTER'::text, 'AUTO_CHAPTER_V3'::text]))),
    CONSTRAINT ingest_job_status_check CHECK ((status = ANY (ARRAY['PENDING'::text, 'RUNNING'::text, 'DONE'::text, 'FAILED'::text, 'CANCELLED'::text, 'SPLIT_DRAFT'::text, 'AWAIT_APPROVAL'::text, 'APPROVED'::text, 'REJECTED'::text, 'AWAITING_DATA_APPROVAL'::text])))
);


--
-- Name: ingest_job_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ingest_job_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ingest_job_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ingest_job_id_seq OWNED BY public.ingest_job.id;


--
-- Name: ingest_task; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ingest_task (
    id bigint NOT NULL,
    job_id bigint NOT NULL,
    story_id bigint NOT NULL,
    unit_type text NOT NULL,
    source_path text,
    seq_no integer NOT NULL,
    status text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    error text,
    payload_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    task_type text DEFAULT 'LEGACY'::text NOT NULL,
    depends_on_task_id bigint,
    idempotency_key text,
    result_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    human_outcome text,
    human_verdict_at timestamp with time zone,
    human_verdict_by text,
    available_at timestamp with time zone DEFAULT now(),
    CONSTRAINT ingest_task_human_outcome_check CHECK (((human_outcome IS NULL) OR (human_outcome = ANY (ARRAY['AWAIT_APPROVAL'::text, 'APPROVED_HUMAN'::text, 'FAILED_HUMAN_REJECTED'::text, 'FAILED_QUALITY'::text])))),
    CONSTRAINT ingest_task_status_check CHECK ((status = ANY (ARRAY['PENDING'::text, 'READY'::text, 'RUNNING'::text, 'WAIT_REVIEW'::text, 'DONE'::text, 'FAILED'::text]))),
    CONSTRAINT ingest_task_task_type_check CHECK ((task_type = ANY (ARRAY['LEGACY'::text, 'LEGACY_CHAPTER_PARSE'::text, 'LEGACY_SCENE_INDEX'::text, 'CHAPTER_INGEST'::text, 'CHAPTER_SPLIT_LLM'::text, 'SCENE_CREATE'::text, 'SPLIT_PROFILE_CORRECTION'::text, 'CHAPTER_VALIDATE'::text, 'WRITING_ANALYSIS'::text, 'MEMORY_ROLLUP'::text, 'WRITING_PLANNING'::text, 'WRITING_PROSE'::text, 'WRITING_CONTINUITY'::text, 'WRITING_SUPERVISOR'::text, 'CHAPTER_WRITE_V3'::text, 'CHAPTER_LEDGER_EXTRACT'::text, 'MEMORY_ROLLUP_V3'::text, 'NARRATIVE_START'::text, 'NARRATIVE_STYLIST'::text, 'NARRATIVE_CRITIC'::text, 'NARRATIVE_REFINE'::text, 'NARRATIVE_FINALIZE'::text]))),
    CONSTRAINT ingest_task_unit_type_check CHECK ((unit_type = ANY (ARRAY['chapter'::text, 'scene'::text, 'split_draft'::text, 'profile_correction'::text, 'chapter_validate'::text, 'chapter_ingest'::text, 'writing_analysis'::text, 'memory_rollup'::text, 'writing_planning'::text, 'writing_prose'::text, 'writing_continuity'::text, 'writing_supervisor'::text])))
);


--
-- Name: ingest_task_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ingest_task_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ingest_task_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ingest_task_id_seq OWNED BY public.ingest_task.id;


--
-- Name: memory_enrich_task; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.memory_enrich_task (
    id bigint NOT NULL,
    story_id bigint NOT NULL,
    scene_id bigint NOT NULL,
    scene_version_id bigint NOT NULL,
    algo_version text NOT NULL,
    status text DEFAULT 'READY'::text NOT NULL,
    retry_count integer DEFAULT 0 NOT NULL,
    last_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    available_at timestamp with time zone DEFAULT now(),
    CONSTRAINT memory_enrich_task_status_check CHECK ((status = ANY (ARRAY['READY'::text, 'RUNNING'::text, 'DONE'::text, 'FAILED'::text])))
);


--
-- Name: memory_enrich_task_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.memory_enrich_task_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: memory_enrich_task_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.memory_enrich_task_id_seq OWNED BY public.memory_enrich_task.id;


--
-- Name: metrics_moltbook_run; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.metrics_moltbook_run (
    id bigint NOT NULL,
    tick_id uuid NOT NULL,
    actions_taken integer DEFAULT 0,
    rate_limited_count integer DEFAULT 0,
    verify_fail_count integer DEFAULT 0,
    errors jsonb DEFAULT '[]'::jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: metrics_moltbook_run_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.metrics_moltbook_run ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.metrics_moltbook_run_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: muse_analysis; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.muse_analysis (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    story_id bigint NOT NULL,
    scene_id bigint,
    raw_content_md text NOT NULL,
    created_by text DEFAULT 'ui'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: muse_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.muse_rules (
    id bigint NOT NULL,
    story_id bigint NOT NULL,
    type text NOT NULL,
    rule_text text NOT NULL,
    why text,
    bad_examples text[] DEFAULT ARRAY[]::text[] NOT NULL,
    good_examples text[] DEFAULT ARRAY[]::text[] NOT NULL,
    weight smallint DEFAULT 50 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT muse_rules_type_check CHECK ((type = ANY (ARRAY['avoid'::text, 'enforce'::text, 'logic'::text, 'pacing'::text, 'voice'::text]))),
    CONSTRAINT muse_rules_weight_check CHECK (((weight >= 0) AND (weight <= 100)))
);


--
-- Name: muse_rules_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.muse_rules_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: muse_rules_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.muse_rules_id_seq OWNED BY public.muse_rules.id;


--
-- Name: muse_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.muse_snapshots (
    id bigint NOT NULL,
    story_id bigint NOT NULL,
    action text DEFAULT 'MANUAL'::text NOT NULL,
    source_snapshot_id bigint,
    note text,
    rules_snapshot jsonb NOT NULL,
    created_by text DEFAULT 'system'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT muse_snapshots_action_check CHECK ((action = ANY (ARRAY['MANUAL'::text, 'APPLY'::text, 'ROLLBACK'::text])))
);


--
-- Name: muse_snapshots_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.muse_snapshots_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: muse_snapshots_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.muse_snapshots_id_seq OWNED BY public.muse_snapshots.id;


--
-- Name: narrative_chapter_staging; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.narrative_chapter_staging (
    id integer NOT NULL,
    story_id integer NOT NULL,
    chapter_id text NOT NULL,
    llm_prose text,
    user_prose text,
    plan_json jsonb,
    status text DEFAULT 'STAGED'::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: narrative_chapter_staging_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.narrative_chapter_staging_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: narrative_chapter_staging_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.narrative_chapter_staging_id_seq OWNED BY public.narrative_chapter_staging.id;


--
-- Name: narrative_moltbook_comment_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.narrative_moltbook_comment_log (
    id bigint NOT NULL,
    post_id text NOT NULL,
    comment_id text NOT NULL,
    parent_id text,
    content text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: narrative_moltbook_comment_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.narrative_moltbook_comment_log ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.narrative_moltbook_comment_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: narrative_moltbook_interaction_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.narrative_moltbook_interaction_log (
    id bigint NOT NULL,
    target_id text NOT NULL,
    target_type text NOT NULL,
    my_action text NOT NULL,
    sentiment text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: narrative_moltbook_interaction_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.narrative_moltbook_interaction_log ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.narrative_moltbook_interaction_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: narrative_moltbook_post_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.narrative_moltbook_post_log (
    id bigint NOT NULL,
    submolt text NOT NULL,
    post_id text NOT NULL,
    author text NOT NULL,
    title text,
    content_hash text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: narrative_moltbook_post_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.narrative_moltbook_post_log ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.narrative_moltbook_post_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: narrative_pipeline_run; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.narrative_pipeline_run (
    id bigint NOT NULL,
    scene_id bigint,
    step text NOT NULL,
    input_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    output_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    llm_params jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'OK'::text NOT NULL,
    error_text text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    story_id bigint NOT NULL,
    CONSTRAINT narrative_pipeline_run_status_check CHECK ((status = ANY (ARRAY['OK'::text, 'ERROR'::text]))),
    CONSTRAINT narrative_pipeline_run_step_check CHECK ((step = ANY (ARRAY['intake'::text, 'outline'::text, 'draft'::text, 'evaluate'::text, 'rewrite'::text, 'lock'::text])))
);


--
-- Name: narrative_pipeline_run_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.narrative_pipeline_run_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: narrative_pipeline_run_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.narrative_pipeline_run_id_seq OWNED BY public.narrative_pipeline_run.id;


--
-- Name: narrative_scene; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.narrative_scene (
    id bigint NOT NULL,
    chapter_id text NOT NULL,
    idx integer DEFAULT 0 NOT NULL,
    draft_text text DEFAULT ''::text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    current_version_id bigint,
    status text DEFAULT 'DRAFTING'::text NOT NULL,
    title text,
    story_id bigint NOT NULL,
    workunit_id text NOT NULL,
    ingest_run_id uuid,
    is_verified boolean DEFAULT false NOT NULL
);


--
-- Name: narrative_scene_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.narrative_scene_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: narrative_scene_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.narrative_scene_id_seq OWNED BY public.narrative_scene.id;


--
-- Name: narrative_scene_version; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.narrative_scene_version (
    id bigint NOT NULL,
    scene_id bigint NOT NULL,
    version_no integer NOT NULL,
    kind text NOT NULL,
    text_content text,
    beats_json jsonb,
    eval_json jsonb,
    summary text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    tsv tsvector,
    story_id bigint NOT NULL,
    ingest_run_id uuid,
    CONSTRAINT narrative_scene_version_kind_check CHECK ((kind = ANY (ARRAY['outline'::text, 'draft'::text, 'rewrite'::text, 'evaluate'::text])))
);


--
-- Name: narrative_scene_latest; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.narrative_scene_latest AS
 SELECT s.id,
    s.story_id,
    s.workunit_id,
    s.chapter_id,
    s.idx,
    s.title,
    s.status,
    s.current_version_id,
    v.kind AS current_kind,
    v.version_no AS current_version_no,
    v.text_content AS current_text,
    v.beats_json AS current_beats,
    v.eval_json AS current_eval,
    s.created_at,
    s.updated_at
   FROM (public.narrative_scene s
     LEFT JOIN public.narrative_scene_version v ON ((v.id = s.current_version_id)));


--
-- Name: narrative_scene_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.narrative_scene_state (
    id bigint NOT NULL,
    story_id bigint NOT NULL,
    scene_id bigint NOT NULL,
    scene_version_id bigint NOT NULL,
    parent_state_id bigint,
    state_snapshot jsonb DEFAULT '{}'::jsonb NOT NULL,
    algo_version text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    is_stale boolean DEFAULT false NOT NULL,
    validation_errors jsonb DEFAULT '[]'::jsonb NOT NULL,
    stale_reason text,
    stale_marked_at timestamp with time zone
);


--
-- Name: narrative_scene_state_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.narrative_scene_state_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: narrative_scene_state_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.narrative_scene_state_id_seq OWNED BY public.narrative_scene_state.id;


--
-- Name: narrative_scene_version_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.narrative_scene_version_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: narrative_scene_version_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.narrative_scene_version_id_seq OWNED BY public.narrative_scene_version.id;


--
-- Name: pack_budget_policy_v1; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pack_budget_policy_v1 (
    id bigint NOT NULL,
    story_id bigint NOT NULL,
    policy_version integer DEFAULT 1 NOT NULL,
    default_model_class text DEFAULT 'default'::text NOT NULL,
    base_budget_tokens integer DEFAULT 2200 NOT NULL,
    planner_reserve_tokens integer DEFAULT 1100 NOT NULL,
    writer_reserve_tokens integer DEFAULT 1400 NOT NULL,
    priority_a_budget integer DEFAULT 1100 NOT NULL,
    priority_b_budget integer DEFAULT 800 NOT NULL,
    priority_c_inline_budget integer DEFAULT 300 NOT NULL,
    compression_mode text DEFAULT 'balanced'::text NOT NULL,
    drop_thresholds jsonb DEFAULT '{"hard_at_ratio": 1.0, "warn_at_ratio": 0.9}'::jsonb NOT NULL,
    model_overrides jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_by text DEFAULT 'system'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    CONSTRAINT pack_budget_policy_v1_compression_mode_check CHECK ((compression_mode = ANY (ARRAY['strict'::text, 'balanced'::text, 'expansive'::text])))
);


--
-- Name: pack_budget_policy_v1_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pack_budget_policy_v1_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pack_budget_policy_v1_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pack_budget_policy_v1_id_seq OWNED BY public.pack_budget_policy_v1.id;


--
-- Name: pipeline_node_event; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pipeline_node_event (
    id bigint NOT NULL,
    story_id bigint NOT NULL,
    job_id bigint NOT NULL,
    task_id bigint,
    flow_type text NOT NULL,
    node_key text NOT NULL,
    status text NOT NULL,
    message text,
    error_code text,
    payload_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT pipeline_node_event_flow_type_check CHECK ((flow_type = ANY (ARRAY['INGEST_SPLIT'::text, 'REPROCESS_SPLIT'::text, 'AUTOWRITE'::text, 'WRITING_ANALYSIS'::text]))),
    CONSTRAINT pipeline_node_event_status_check CHECK ((status = ANY (ARRAY['PENDING'::text, 'READY'::text, 'RUNNING'::text, 'WAIT_REVIEW'::text, 'DONE'::text, 'FAILED'::text, 'BLOCKED'::text, 'SKIPPED'::text])))
);


--
-- Name: pipeline_node_event_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pipeline_node_event_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pipeline_node_event_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pipeline_node_event_id_seq OWNED BY public.pipeline_node_event.id;


--
-- Name: pipeline_node_type; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pipeline_node_type (
    type_slug text NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: post_chapter_profile_v1; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.post_chapter_profile_v1 (
    id bigint NOT NULL,
    story_id bigint NOT NULL,
    chapter_id text NOT NULL,
    job_id bigint,
    chapter_mode text NOT NULL,
    pov_mode text NOT NULL,
    timeline_mode text NOT NULL,
    reveal_sensitivity text NOT NULL,
    cast_pressure text NOT NULL,
    thread_pressure text NOT NULL,
    profile_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_by text DEFAULT 'system'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: post_chapter_profile_v1_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.post_chapter_profile_v1_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: post_chapter_profile_v1_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.post_chapter_profile_v1_id_seq OWNED BY public.post_chapter_profile_v1.id;


--
-- Name: pre_chapter_profile_v1; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pre_chapter_profile_v1 (
    id bigint NOT NULL,
    story_id bigint NOT NULL,
    chapter_id text NOT NULL,
    job_id bigint,
    chapter_mode text NOT NULL,
    pov_mode text NOT NULL,
    timeline_mode text NOT NULL,
    reveal_sensitivity text NOT NULL,
    cast_pressure text NOT NULL,
    thread_pressure text NOT NULL,
    profile_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_by text DEFAULT 'system'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: pre_chapter_profile_v1_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pre_chapter_profile_v1_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pre_chapter_profile_v1_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pre_chapter_profile_v1_id_seq OWNED BY public.pre_chapter_profile_v1.id;


--
-- Name: priority_override_rules_v1; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.priority_override_rules_v1 (
    id bigint NOT NULL,
    story_id bigint,
    rule_key text NOT NULL,
    chapter_mode text DEFAULT 'any'::text NOT NULL,
    cast_pressure text DEFAULT 'any'::text NOT NULL,
    reveal_sensitivity text DEFAULT 'any'::text NOT NULL,
    timeline_mode text DEFAULT 'any'::text NOT NULL,
    pov_mode text DEFAULT 'any'::text NOT NULL,
    promote_to_a jsonb DEFAULT '[]'::jsonb NOT NULL,
    demote_to_c jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_by text DEFAULT 'system'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    is_active boolean DEFAULT true NOT NULL
);


--
-- Name: priority_override_rules_v1_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.priority_override_rules_v1_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: priority_override_rules_v1_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.priority_override_rules_v1_id_seq OWNED BY public.priority_override_rules_v1.id;


--
-- Name: review_apply_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.review_apply_log (
    id bigint NOT NULL,
    request_id bigint NOT NULL,
    applied_by text,
    applied_at timestamp with time zone DEFAULT now() NOT NULL,
    canon_inserted_ids bigint[] DEFAULT ARRAY[]::bigint[] NOT NULL,
    response_id bigint,
    human_overall numeric(4,2),
    ai_overall numeric(4,2),
    fused_overall numeric(4,2),
    decision text,
    CONSTRAINT review_apply_log_decision_check CHECK (((decision IS NULL) OR (decision = ANY (ARRAY['LOCK'::text, 'REWRITE'::text]))))
);


--
-- Name: review_apply_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.review_apply_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: review_apply_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.review_apply_log_id_seq OWNED BY public.review_apply_log.id;


--
-- Name: review_request; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.review_request (
    id bigint NOT NULL,
    story_id bigint NOT NULL,
    scene_version_id bigint NOT NULL,
    job_id bigint,
    status text NOT NULL,
    rubric_version text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    chapter_id text,
    is_v3 boolean DEFAULT false,
    CONSTRAINT review_request_status_check CHECK ((status = ANY (ARRAY['OPEN'::text, 'SUBMITTED'::text, 'APPLIED'::text])))
);


--
-- Name: review_request_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.review_request_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: review_request_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.review_request_id_seq OWNED BY public.review_request.id;


--
-- Name: review_response; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.review_response (
    id bigint NOT NULL,
    request_id bigint NOT NULL,
    reviewer_name text,
    scores_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    flags_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    suggestions_text text,
    canon_proposals_json jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: review_response_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.review_response_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: review_response_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.review_response_id_seq OWNED BY public.review_response.id;


--
-- Name: schema_migration; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schema_migration (
    filename text NOT NULL,
    applied_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: shadow_run_pair; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shadow_run_pair (
    id bigint NOT NULL,
    story_id bigint NOT NULL,
    chapter_id text,
    job_id bigint,
    task_id bigint,
    agent_name text DEFAULT 'SPLITTER'::text NOT NULL,
    active_run_trace_id bigint,
    shadow_run_trace_id bigint,
    context_snapshot_id bigint,
    active_prompt_version_id bigint,
    shadow_prompt_version_id bigint,
    pair_status text DEFAULT 'PLANNED'::text NOT NULL,
    compare_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: shadow_run_pair_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.shadow_run_pair_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: shadow_run_pair_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.shadow_run_pair_id_seq OWNED BY public.shadow_run_pair.id;


--
-- Name: source_doc; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.source_doc (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    story_id bigint NOT NULL,
    doc_type text NOT NULL,
    origin jsonb DEFAULT '{}'::jsonb NOT NULL,
    raw_text text NOT NULL,
    raw_text_sha256 text NOT NULL,
    char_len integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    is_stable boolean DEFAULT false NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    CONSTRAINT source_doc_char_len_check CHECK ((char_len >= 0)),
    CONSTRAINT source_doc_doc_type_check CHECK ((doc_type = 'ingest_chapter'::text))
);


--
-- Name: split_feedback; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.split_feedback (
    id bigint NOT NULL,
    story_id bigint NOT NULL,
    job_id bigint,
    chapter_task_id bigint,
    chapter_id text NOT NULL,
    strategy text,
    rating smallint NOT NULL,
    issue_code text,
    note text,
    created_by text DEFAULT 'ui'::text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    boundary_scene_idx_left integer,
    boundary_scene_idx_right integer,
    boundary_char_offset integer,
    feedback_quality_score numeric(4,3) DEFAULT 0.500,
    structured_tags jsonb,
    taxonomy_version text,
    rule_pack_version text,
    version_pair_valid boolean DEFAULT true NOT NULL,
    token_key text,
    location_ref text,
    detection_mode text,
    enforcement_mode text,
    reason_code text,
    freeze_window_id text,
    frozen_at timestamp with time zone,
    original_detection_mode text,
    original_enforcement_mode text,
    current_detection_mode text,
    current_enforcement_mode text,
    CONSTRAINT split_feedback_quality_score_check CHECK (((feedback_quality_score IS NULL) OR ((feedback_quality_score >= 0.000) AND (feedback_quality_score <= 1.000)))),
    CONSTRAINT split_feedback_rating_check CHECK ((rating = ANY (ARRAY['-1'::integer, 1])))
);


--
-- Name: split_feedback_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.split_feedback_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: split_feedback_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.split_feedback_id_seq OWNED BY public.split_feedback.id;


--
-- Name: split_strategy_profile; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.split_strategy_profile (
    story_id bigint NOT NULL,
    chapter_id text NOT NULL,
    profile_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    profile_version bigint DEFAULT 1 NOT NULL
);


--
-- Name: story_active_analysis_scope_snapshot; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.story_active_analysis_scope_snapshot (
    id bigint NOT NULL,
    story_id bigint NOT NULL,
    scope_type text NOT NULL,
    scope_key text NOT NULL,
    snapshot_id bigint NOT NULL,
    activated_by text DEFAULT 'operator'::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT story_active_analysis_scope_snapshot_scope_type_check CHECK ((scope_type = ANY (ARRAY['batch'::text, 'arc'::text, 'story'::text])))
);


--
-- Name: story_active_analysis_scope_snapshot_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.story_active_analysis_scope_snapshot_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: story_active_analysis_scope_snapshot_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.story_active_analysis_scope_snapshot_id_seq OWNED BY public.story_active_analysis_scope_snapshot.id;


--
-- Name: story_active_analysis_snapshot; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.story_active_analysis_snapshot (
    id bigint NOT NULL,
    story_id bigint NOT NULL,
    chapter_id text NOT NULL,
    snapshot_id bigint NOT NULL,
    activated_by text DEFAULT 'system'::text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: story_active_analysis_snapshot_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.story_active_analysis_snapshot_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: story_active_analysis_snapshot_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.story_active_analysis_snapshot_id_seq OWNED BY public.story_active_analysis_snapshot.id;


--
-- Name: story_arc; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.story_arc (
    id bigint NOT NULL,
    story_id bigint NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    kind text NOT NULL,
    act_model smallint DEFAULT 3 NOT NULL,
    order_no integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT story_arc_act_model_check CHECK ((act_model = ANY (ARRAY[3, 5]))),
    CONSTRAINT story_arc_kind_check CHECK ((kind = ANY (ARRAY['main'::text, 'sub'::text])))
);


--
-- Name: story_arc_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.story_arc_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: story_arc_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.story_arc_id_seq OWNED BY public.story_arc.id;


--
-- Name: story_beat; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.story_beat (
    id bigint NOT NULL,
    map_version_id bigint NOT NULL,
    scene_id bigint NOT NULL,
    beat_idx integer NOT NULL,
    goal text DEFAULT ''::text NOT NULL,
    conflict text DEFAULT ''::text NOT NULL,
    outcome text DEFAULT ''::text NOT NULL,
    pov text DEFAULT ''::text NOT NULL,
    thread_ids bigint[] DEFAULT ARRAY[]::bigint[] NOT NULL,
    arc_id bigint,
    notes_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT story_beat_beat_idx_check CHECK ((beat_idx >= 0))
);


--
-- Name: story_beat_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.story_beat_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: story_beat_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.story_beat_id_seq OWNED BY public.story_beat.id;


--
-- Name: story_canon_fact; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.story_canon_fact (
    id bigint NOT NULL,
    story_id bigint NOT NULL,
    category text NOT NULL,
    content text NOT NULL,
    importance smallint DEFAULT 3 NOT NULL,
    source_ref text,
    content_tsv tsvector,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    universe_id text DEFAULT 'main'::text NOT NULL,
    entity_kind text DEFAULT 'individual'::text NOT NULL,
    CONSTRAINT story_canon_fact_category_check CHECK ((category = ANY (ARRAY['character'::text, 'location'::text, 'item'::text, 'lore'::text, 'event'::text, 'relationship'::text]))),
    CONSTRAINT story_canon_fact_entity_kind_check CHECK ((entity_kind = ANY (ARRAY['individual'::text, 'collective'::text, 'persona'::text]))),
    CONSTRAINT story_canon_fact_importance_check CHECK (((importance >= 1) AND (importance <= 5)))
);


--
-- Name: story_canon_fact_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.story_canon_fact_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: story_canon_fact_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.story_canon_fact_id_seq OWNED BY public.story_canon_fact.id;


--
-- Name: story_caution; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.story_caution (
    id bigint NOT NULL,
    story_id bigint NOT NULL,
    code text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: story_caution_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.story_caution_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: story_caution_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.story_caution_id_seq OWNED BY public.story_caution.id;


--
-- Name: story_chapter; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.story_chapter (
    id bigint NOT NULL,
    story_id bigint NOT NULL,
    chapter_id text NOT NULL,
    title text,
    summary text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    arc_id bigint
);


--
-- Name: story_chapter_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.story_chapter_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: story_chapter_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.story_chapter_id_seq OWNED BY public.story_chapter.id;


--
-- Name: story_dictionary; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.story_dictionary (
    id bigint NOT NULL,
    story_id bigint,
    tier text NOT NULL,
    term_key text NOT NULL,
    definition text NOT NULL,
    agent_instructions text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    priority integer DEFAULT 5 NOT NULL,
    scope text DEFAULT 'local'::text NOT NULL,
    aliases jsonb DEFAULT '[]'::jsonb NOT NULL,
    valid_from_chapter integer,
    valid_to_chapter integer,
    CONSTRAINT story_dictionary_scope_check CHECK ((scope = ANY (ARRAY['local'::text, 'global'::text]))),
    CONSTRAINT story_dictionary_tier_check CHECK ((tier = ANY (ARRAY['technical'::text, 'narrative'::text, 'style'::text])))
);


--
-- Name: story_dictionary_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.story_dictionary_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: story_dictionary_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.story_dictionary_id_seq OWNED BY public.story_dictionary.id;


--
-- Name: story_image; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.story_image (
    id bigint NOT NULL,
    story_id bigint NOT NULL,
    kind text NOT NULL,
    path text NOT NULL,
    caption_md text,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT story_image_kind_check CHECK ((kind = ANY (ARRAY['cover'::text, 'gallery'::text, 'character'::text, 'scene'::text])))
);


--
-- Name: story_image_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.story_image_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: story_image_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.story_image_id_seq OWNED BY public.story_image.id;


--
-- Name: story_map_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.story_map_state (
    story_id bigint NOT NULL,
    active_version_id bigint,
    working_version_id bigint,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: story_map_version; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.story_map_version (
    id bigint NOT NULL,
    story_id bigint NOT NULL,
    version_no integer NOT NULL,
    status text NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by text,
    payload_hash text,
    CONSTRAINT story_map_version_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'committed'::text])))
);


--
-- Name: story_map_version_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.story_map_version_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: story_map_version_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.story_map_version_id_seq OWNED BY public.story_map_version.id;


--
-- Name: story_milestone; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.story_milestone (
    id bigint NOT NULL,
    story_id bigint NOT NULL,
    arc_id bigint,
    chapter_from text NOT NULL,
    chapter_to text NOT NULL,
    summary_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    source_hash text,
    quality_score numeric(6,4) DEFAULT 0 NOT NULL,
    created_by text DEFAULT 'system'::text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    is_stale boolean DEFAULT false NOT NULL,
    stale_reason text,
    universe_id text DEFAULT 'main'::text NOT NULL,
    analysis_delta_report_json jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- Name: story_milestone_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.story_milestone_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: story_milestone_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.story_milestone_id_seq OWNED BY public.story_milestone.id;


--
-- Name: story_quality_policy; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.story_quality_policy (
    story_id bigint NOT NULL,
    golden_chapter_ids jsonb DEFAULT '[]'::jsonb NOT NULL,
    golden_min_runs integer DEFAULT 5 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT story_quality_policy_golden_min_runs_check CHECK (((golden_min_runs >= 1) AND (golden_min_runs <= 1000)))
);


--
-- Name: story_scene_map; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.story_scene_map (
    id bigint NOT NULL,
    map_version_id bigint NOT NULL,
    scene_id bigint NOT NULL,
    chapter_id text NOT NULL,
    sequence_no integer DEFAULT 0 NOT NULL,
    act_label text,
    arc_id bigint,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: story_scene_map_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.story_scene_map_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: story_scene_map_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.story_scene_map_id_seq OWNED BY public.story_scene_map.id;


--
-- Name: story_series; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.story_series (
    id bigint NOT NULL,
    slug text NOT NULL,
    title text NOT NULL,
    status text DEFAULT 'ACTIVE'::text NOT NULL,
    system_prompt text,
    tone_profile_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    default_llm_params_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    settings_json jsonb DEFAULT jsonb_build_object('thread_orphan_n', 5) NOT NULL,
    map_locked boolean DEFAULT false NOT NULL,
    library_status text DEFAULT 'draft'::text NOT NULL,
    description_md text,
    author_note_md text,
    summary_md text,
    cover_image_path text,
    caution_other_md text,
    background_image_path text,
    CONSTRAINT story_series_library_status_check CHECK ((library_status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text, 'private'::text]))),
    CONSTRAINT story_series_status_check CHECK ((status = ANY (ARRAY['ACTIVE'::text, 'ARCHIVED'::text, 'DRAFT'::text])))
);


--
-- Name: story_series_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.story_series_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: story_series_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.story_series_id_seq OWNED BY public.story_series.id;


--
-- Name: story_style_profile; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.story_style_profile (
    story_id bigint NOT NULL,
    tone_baseline text DEFAULT ''::text NOT NULL,
    darkness_level smallint DEFAULT 50 NOT NULL,
    political_intensity smallint DEFAULT 50 NOT NULL,
    pacing_bias smallint DEFAULT 50 NOT NULL,
    prose_density smallint DEFAULT 50 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT story_style_profile_darkness_level_check CHECK (((darkness_level >= 0) AND (darkness_level <= 100))),
    CONSTRAINT story_style_profile_pacing_bias_check CHECK (((pacing_bias >= 0) AND (pacing_bias <= 100))),
    CONSTRAINT story_style_profile_political_intensity_check CHECK (((political_intensity >= 0) AND (political_intensity <= 100))),
    CONSTRAINT story_style_profile_prose_density_check CHECK (((prose_density >= 0) AND (prose_density <= 100)))
);


--
-- Name: story_tag; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.story_tag (
    id bigint NOT NULL,
    story_id bigint NOT NULL,
    tag text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: story_tag_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.story_tag_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: story_tag_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.story_tag_id_seq OWNED BY public.story_tag.id;


--
-- Name: story_thread; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.story_thread (
    id bigint NOT NULL,
    story_id bigint NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    type text NOT NULL,
    importance smallint DEFAULT 3 NOT NULL,
    color text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT story_thread_importance_check CHECK (((importance >= 1) AND (importance <= 5))),
    CONSTRAINT story_thread_type_check CHECK ((type = ANY (ARRAY['plot_line'::text, 'character_arc'::text])))
);


--
-- Name: story_thread_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.story_thread_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: story_thread_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.story_thread_id_seq OWNED BY public.story_thread.id;


--
-- Name: story_worldbuilding_note; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.story_worldbuilding_note (
    id bigint NOT NULL,
    story_id bigint NOT NULL,
    category text NOT NULL,
    content text NOT NULL,
    importance smallint DEFAULT 3 NOT NULL,
    injection_mode text DEFAULT 'CORE'::text NOT NULL,
    tags text[] DEFAULT ARRAY[]::text[] NOT NULL,
    content_tsv tsvector,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT story_worldbuilding_note_importance_check CHECK (((importance >= 1) AND (importance <= 5))),
    CONSTRAINT story_worldbuilding_note_injection_mode_check CHECK ((injection_mode = ANY (ARRAY['CORE'::text, 'TAGGED'::text, 'MANUAL_ONLY'::text])))
);


--
-- Name: story_worldbuilding_note_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.story_worldbuilding_note_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: story_worldbuilding_note_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.story_worldbuilding_note_id_seq OWNED BY public.story_worldbuilding_note.id;


--
-- Name: style_profile_scene; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.style_profile_scene (
    id bigint NOT NULL,
    story_id bigint NOT NULL,
    scene_id bigint NOT NULL,
    scene_version_id bigint NOT NULL,
    algo_version text NOT NULL,
    sentence_complexity numeric(5,4),
    dialogue_ratio numeric(5,4),
    metaphor_density numeric(5,4),
    sensory_sight numeric(5,4),
    sensory_sound numeric(5,4),
    sensory_touch numeric(5,4),
    sensory_smell numeric(5,4),
    sensory_taste numeric(5,4),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: style_profile_scene_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.style_profile_scene_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: style_profile_scene_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.style_profile_scene_id_seq OWNED BY public.style_profile_scene.id;


--
-- Name: supervisor_memory; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.supervisor_memory (
    id bigint NOT NULL,
    story_id bigint NOT NULL,
    job_id bigint,
    chapter_task_id bigint NOT NULL,
    chapter_id text,
    label text NOT NULL,
    source_type text,
    source_role text,
    strategy_selected text,
    supervisor_decision text,
    human_outcome text,
    quality_self_signal numeric(5,4),
    is_reprocess boolean DEFAULT false NOT NULL,
    signals_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    summary text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT supervisor_memory_label_check CHECK ((label = ANY (ARRAY['SUCCESS_NO_REPROCESS'::text, 'SUCCESS_AFTER_REPROCESS'::text, 'FAILED_PATTERN'::text]))),
    CONSTRAINT supervisor_memory_quality_self_signal_check CHECK (((quality_self_signal IS NULL) OR ((quality_self_signal >= 0.0000) AND (quality_self_signal <= 1.0000))))
);


--
-- Name: supervisor_memory_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.supervisor_memory_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: supervisor_memory_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.supervisor_memory_id_seq OWNED BY public.supervisor_memory.id;


--
-- Name: system_heartbeat; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_heartbeat (
    key text NOT NULL,
    last_at timestamp with time zone DEFAULT now()
);


--
-- Name: taxonomy_hotfix_event; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.taxonomy_hotfix_event (
    id bigint NOT NULL,
    taxonomy_version text NOT NULL,
    rule_pack_version text NOT NULL,
    action text NOT NULL,
    reason text NOT NULL,
    initiated_by text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT taxonomy_hotfix_event_action_check CHECK ((action = ANY (ARRAY['BREAK_PAIR'::text, 'RESTORE_PAIR'::text])))
);


--
-- Name: taxonomy_hotfix_event_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.taxonomy_hotfix_event_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: taxonomy_hotfix_event_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.taxonomy_hotfix_event_id_seq OWNED BY public.taxonomy_hotfix_event.id;


--
-- Name: taxonomy_rule_pack_compatibility; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.taxonomy_rule_pack_compatibility (
    id bigint NOT NULL,
    taxonomy_version text NOT NULL,
    rule_pack_version text NOT NULL,
    is_enabled boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: taxonomy_rule_pack_compatibility_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.taxonomy_rule_pack_compatibility_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: taxonomy_rule_pack_compatibility_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.taxonomy_rule_pack_compatibility_id_seq OWNED BY public.taxonomy_rule_pack_compatibility.id;


--
-- Name: thread_state_v1; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.thread_state_v1 (
    id bigint NOT NULL,
    story_id bigint NOT NULL,
    thread_id text NOT NULL,
    label text NOT NULL,
    origin_chapter text,
    last_touched_chapter text,
    status text DEFAULT 'open'::text NOT NULL,
    urgency text DEFAULT 'medium'::text NOT NULL,
    aging_score numeric(6,3) DEFAULT 0 NOT NULL,
    pressure_score numeric(6,3) DEFAULT 0 NOT NULL,
    related_entities jsonb DEFAULT '[]'::jsonb NOT NULL,
    related_locations jsonb DEFAULT '[]'::jsonb NOT NULL,
    visibility_scope text DEFAULT 'reader'::text NOT NULL,
    closure_conditions jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: thread_state_v1_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.thread_state_v1_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: thread_state_v1_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.thread_state_v1_id_seq OWNED BY public.thread_state_v1.id;


--
-- Name: timeline_anchor; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.timeline_anchor (
    id bigint NOT NULL,
    story_id bigint NOT NULL,
    scene_id bigint NOT NULL,
    scene_version_id bigint NOT NULL,
    algo_version text NOT NULL,
    event_label text NOT NULL,
    relative_time text,
    absolute_time text,
    location text,
    participants text[] DEFAULT ARRAY[]::text[] NOT NULL,
    source_trace jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    universe_id text DEFAULT 'main'::text NOT NULL,
    entity_kind text DEFAULT 'individual'::text NOT NULL,
    CONSTRAINT timeline_anchor_entity_kind_check CHECK ((entity_kind = ANY (ARRAY['individual'::text, 'collective'::text, 'persona'::text])))
);


--
-- Name: timeline_anchor_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.timeline_anchor_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: timeline_anchor_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.timeline_anchor_id_seq OWNED BY public.timeline_anchor.id;


--
-- Name: timeline_event; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.timeline_event (
    id bigint NOT NULL,
    event_key text,
    start_ts timestamp without time zone,
    end_ts timestamp without time zone,
    title text,
    body text NOT NULL,
    tags text[] DEFAULT ARRAY[]::text[] NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    tsv tsvector,
    story_id bigint NOT NULL
);


--
-- Name: timeline_event_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.timeline_event_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: timeline_event_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.timeline_event_id_seq OWNED BY public.timeline_event.id;


--
-- Name: token_change_audit_event; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.token_change_audit_event (
    id bigint NOT NULL,
    token_key text NOT NULL,
    change_type text NOT NULL,
    from_state text,
    to_state text,
    evidence_ref text,
    approved_by text NOT NULL,
    approved_at timestamp with time zone DEFAULT now() NOT NULL,
    taxonomy_version text NOT NULL,
    rule_pack_version text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT token_change_audit_event_change_type_check CHECK ((change_type = ANY (ARRAY['PROMOTE'::text, 'DEMOTE'::text, 'SEVERITY_CHANGE'::text, 'ACTION_CHANGE'::text])))
);


--
-- Name: token_change_audit_event_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.token_change_audit_event_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: token_change_audit_event_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.token_change_audit_event_id_seq OWNED BY public.token_change_audit_event.id;


--
-- Name: truth_adjudication_snapshot_v1; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.truth_adjudication_snapshot_v1 (
    id bigint NOT NULL,
    story_id bigint NOT NULL,
    chapter_id text NOT NULL,
    entity_resolution_snapshot_id bigint,
    fact_status text DEFAULT 'UNVETTED'::text NOT NULL,
    adjudication_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: truth_adjudication_snapshot_v1_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.truth_adjudication_snapshot_v1_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: truth_adjudication_snapshot_v1_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.truth_adjudication_snapshot_v1_id_seq OWNED BY public.truth_adjudication_snapshot_v1.id;


--
-- Name: truth_conflict_registry; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.truth_conflict_registry (
    id bigint NOT NULL,
    story_id bigint NOT NULL,
    chapter_id text,
    agent_name text DEFAULT 'SPLITTER'::text NOT NULL,
    job_id bigint,
    task_id bigint,
    run_trace_id bigint,
    context_snapshot_id bigint,
    conflict_id text NOT NULL,
    losing_rule_ref text NOT NULL,
    winning_rule_ref text NOT NULL,
    resolution_mode text DEFAULT 'HIERARCHY'::text NOT NULL,
    resolution_reason text DEFAULT ''::text NOT NULL,
    payload_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: truth_conflict_registry_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.truth_conflict_registry_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: truth_conflict_registry_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.truth_conflict_registry_id_seq OWNED BY public.truth_conflict_registry.id;


--
-- Name: validate_rule_feedback; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.validate_rule_feedback (
    id bigint NOT NULL,
    story_id bigint NOT NULL,
    chapter_id text,
    pattern text NOT NULL,
    description text,
    severity text DEFAULT 'warning'::text NOT NULL,
    created_by text DEFAULT 'ui'::text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT validate_rule_feedback_severity_check CHECK ((severity = ANY (ARRAY['error'::text, 'warning'::text, 'info'::text])))
);


--
-- Name: validate_rule_feedback_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.validate_rule_feedback_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: validate_rule_feedback_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.validate_rule_feedback_id_seq OWNED BY public.validate_rule_feedback.id;


--
-- Name: writing_analysis_staging; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.writing_analysis_staging (
    id bigint NOT NULL,
    story_id bigint NOT NULL,
    job_id bigint,
    task_id bigint,
    chapter_id text,
    source_hash text,
    candidate_facts_json jsonb DEFAULT '[]'::jsonb NOT NULL,
    narrative_metrics_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    vetting_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'STAGED'::text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT writing_analysis_staging_status_check CHECK ((status = ANY (ARRAY['STAGED'::text, 'VETTED'::text, 'INTEGRATED'::text, 'UNVETTED'::text, 'EMPTY_WARNING'::text])))
);


--
-- Name: writing_analysis_staging_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.writing_analysis_staging_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: writing_analysis_staging_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.writing_analysis_staging_id_seq OWNED BY public.writing_analysis_staging.id;


--
-- Name: writing_scope_snapshot_v1; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.writing_scope_snapshot_v1 (
    id bigint NOT NULL,
    story_id bigint NOT NULL,
    scope_type text NOT NULL,
    scope_key text NOT NULL,
    source_snapshot_ids jsonb DEFAULT '[]'::jsonb NOT NULL,
    coverage_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    fact_status text DEFAULT 'UNVETTED'::text NOT NULL,
    ready_for_writing boolean DEFAULT false NOT NULL,
    degraded_mode boolean DEFAULT false NOT NULL,
    narrative_score numeric(5,4) DEFAULT 0 NOT NULL,
    emotional_target text,
    snapshot_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_by text DEFAULT 'system'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    approval_status text DEFAULT 'DRAFT'::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    is_stale boolean DEFAULT false NOT NULL,
    stale_reason text,
    universe_id text DEFAULT 'main'::text NOT NULL,
    pre_chapter_profile_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    post_chapter_profile_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    truth_context_pack_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    analysis_delta_report_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT writing_scope_snapshot_v1_approval_status_check CHECK ((approval_status = ANY (ARRAY['DRAFT'::text, 'APPROVED'::text, 'SUPERSEDED'::text, 'CANCELED'::text]))),
    CONSTRAINT writing_scope_snapshot_v1_scope_type_check CHECK ((scope_type = ANY (ARRAY['batch'::text, 'arc'::text, 'story'::text])))
);


--
-- Name: writing_scope_snapshot_v1_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.writing_scope_snapshot_v1_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: writing_scope_snapshot_v1_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.writing_scope_snapshot_v1_id_seq OWNED BY public.writing_scope_snapshot_v1.id;


--
-- Name: writing_snapshot_v3; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.writing_snapshot_v3 (
    id bigint NOT NULL,
    story_id bigint NOT NULL,
    job_id bigint,
    task_id bigint,
    chapter_id text,
    fact_status text DEFAULT 'UNVETTED'::text NOT NULL,
    narrative_score numeric(6,4) DEFAULT 0 NOT NULL,
    emotional_target text,
    open_loops jsonb DEFAULT '[]'::jsonb NOT NULL,
    lore_debt boolean DEFAULT false NOT NULL,
    snapshot_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    degraded_mode boolean DEFAULT false NOT NULL,
    completeness_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    ready_for_writing boolean DEFAULT false NOT NULL,
    approval_status text DEFAULT 'DRAFT'::text NOT NULL,
    universe_id text DEFAULT 'main'::text NOT NULL,
    pre_chapter_profile_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    post_chapter_profile_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    truth_context_pack_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    analysis_delta_report_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT writing_snapshot_v3_approval_status_check CHECK ((approval_status = ANY (ARRAY['DRAFT'::text, 'APPROVED'::text, 'SUPERSEDED'::text, 'CANCELED'::text]))),
    CONSTRAINT writing_snapshot_v3_fact_status_check CHECK ((fact_status = ANY (ARRAY['CLEAN'::text, 'CONFLICT'::text, 'UNVETTED'::text, 'EMPTY_WARNING'::text, 'INCOMPLETE_COVERAGE'::text])))
);


--
-- Name: writing_snapshot_v3_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.writing_snapshot_v3_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: writing_snapshot_v3_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.writing_snapshot_v3_id_seq OWNED BY public.writing_snapshot_v3.id;


--
-- Name: agent_context_snapshot id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_context_snapshot ALTER COLUMN id SET DEFAULT nextval('public.agent_context_snapshot_id_seq'::regclass);


--
-- Name: agent_equipment_slots id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_equipment_slots ALTER COLUMN id SET DEFAULT nextval('public.agent_equipment_slots_id_seq'::regclass);


--
-- Name: agent_feedback_loop id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_feedback_loop ALTER COLUMN id SET DEFAULT nextval('public.agent_feedback_loop_id_seq'::regclass);


--
-- Name: agent_janitor_task id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_janitor_task ALTER COLUMN id SET DEFAULT nextval('public.agent_janitor_task_id_seq'::regclass);


--
-- Name: agent_memory_vector id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_memory_vector ALTER COLUMN id SET DEFAULT nextval('public.agent_memory_vector_id_seq'::regclass);


--
-- Name: agent_profile_event id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_profile_event ALTER COLUMN id SET DEFAULT nextval('public.agent_profile_event_id_seq'::regclass);


--
-- Name: agent_profiles id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_profiles ALTER COLUMN id SET DEFAULT nextval('public.agent_profiles_id_seq'::regclass);


--
-- Name: agent_prompt_experiment id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_prompt_experiment ALTER COLUMN id SET DEFAULT nextval('public.agent_prompt_experiment_id_seq'::regclass);


--
-- Name: agent_prompt_hydration_trace id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_prompt_hydration_trace ALTER COLUMN id SET DEFAULT nextval('public.agent_prompt_hydration_trace_id_seq'::regclass);


--
-- Name: agent_prompt_profile id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_prompt_profile ALTER COLUMN id SET DEFAULT nextval('public.agent_prompt_profile_id_seq'::regclass);


--
-- Name: agent_prompt_version id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_prompt_version ALTER COLUMN id SET DEFAULT nextval('public.agent_prompt_version_id_seq'::regclass);


--
-- Name: agent_run_trace id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_run_trace ALTER COLUMN id SET DEFAULT nextval('public.agent_run_trace_id_seq'::regclass);


--
-- Name: agent_tuning_event id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_tuning_event ALTER COLUMN id SET DEFAULT nextval('public.agent_tuning_event_id_seq'::regclass);


--
-- Name: analysis_delta_report_v1 id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.analysis_delta_report_v1 ALTER COLUMN id SET DEFAULT nextval('public.analysis_delta_report_v1_id_seq'::regclass);


--
-- Name: author_annotation_v1 annotation_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.author_annotation_v1 ALTER COLUMN annotation_id SET DEFAULT nextval('public.author_annotation_v1_annotation_id_seq'::regclass);


--
-- Name: canon_fact id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.canon_fact ALTER COLUMN id SET DEFAULT nextval('public.canon_fact_id_seq'::regclass);


--
-- Name: chapter_continuity_issue id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chapter_continuity_issue ALTER COLUMN id SET DEFAULT nextval('public.chapter_continuity_issue_id_seq'::regclass);


--
-- Name: chapter_draft id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chapter_draft ALTER COLUMN id SET DEFAULT nextval('public.chapter_draft_id_seq'::regclass);


--
-- Name: chapter_ledger id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chapter_ledger ALTER COLUMN id SET DEFAULT nextval('public.chapter_ledger_id_seq'::regclass);


--
-- Name: core_memory_vetting_event id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.core_memory_vetting_event ALTER COLUMN id SET DEFAULT nextval('public.core_memory_vetting_event_id_seq'::regclass);


--
-- Name: core_memory_vetting_state id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.core_memory_vetting_state ALTER COLUMN id SET DEFAULT nextval('public.core_memory_vetting_state_id_seq'::regclass);


--
-- Name: entity_conflict_review id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_conflict_review ALTER COLUMN id SET DEFAULT nextval('public.entity_conflict_review_id_seq'::regclass);


--
-- Name: entity_conflict_review_event id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_conflict_review_event ALTER COLUMN id SET DEFAULT nextval('public.entity_conflict_review_event_id_seq'::regclass);


--
-- Name: entity_merge_challenge_v1 id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_merge_challenge_v1 ALTER COLUMN id SET DEFAULT nextval('public.entity_merge_challenge_v1_id_seq'::regclass);


--
-- Name: entity_resolution_snapshot_v1 id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_resolution_snapshot_v1 ALTER COLUMN id SET DEFAULT nextval('public.entity_resolution_snapshot_v1_id_seq'::regclass);


--
-- Name: entity_truth_overlay id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_truth_overlay ALTER COLUMN id SET DEFAULT nextval('public.entity_truth_overlay_id_seq'::regclass);


--
-- Name: ingest_job id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ingest_job ALTER COLUMN id SET DEFAULT nextval('public.ingest_job_id_seq'::regclass);


--
-- Name: ingest_task id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ingest_task ALTER COLUMN id SET DEFAULT nextval('public.ingest_task_id_seq'::regclass);


--
-- Name: memory_enrich_task id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.memory_enrich_task ALTER COLUMN id SET DEFAULT nextval('public.memory_enrich_task_id_seq'::regclass);


--
-- Name: muse_rules id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.muse_rules ALTER COLUMN id SET DEFAULT nextval('public.muse_rules_id_seq'::regclass);


--
-- Name: muse_snapshots id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.muse_snapshots ALTER COLUMN id SET DEFAULT nextval('public.muse_snapshots_id_seq'::regclass);


--
-- Name: narrative_chapter_staging id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.narrative_chapter_staging ALTER COLUMN id SET DEFAULT nextval('public.narrative_chapter_staging_id_seq'::regclass);


--
-- Name: narrative_pipeline_run id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.narrative_pipeline_run ALTER COLUMN id SET DEFAULT nextval('public.narrative_pipeline_run_id_seq'::regclass);


--
-- Name: narrative_scene id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.narrative_scene ALTER COLUMN id SET DEFAULT nextval('public.narrative_scene_id_seq'::regclass);


--
-- Name: narrative_scene_state id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.narrative_scene_state ALTER COLUMN id SET DEFAULT nextval('public.narrative_scene_state_id_seq'::regclass);


--
-- Name: narrative_scene_version id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.narrative_scene_version ALTER COLUMN id SET DEFAULT nextval('public.narrative_scene_version_id_seq'::regclass);


--
-- Name: pack_budget_policy_v1 id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pack_budget_policy_v1 ALTER COLUMN id SET DEFAULT nextval('public.pack_budget_policy_v1_id_seq'::regclass);


--
-- Name: pipeline_node_event id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pipeline_node_event ALTER COLUMN id SET DEFAULT nextval('public.pipeline_node_event_id_seq'::regclass);


--
-- Name: post_chapter_profile_v1 id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_chapter_profile_v1 ALTER COLUMN id SET DEFAULT nextval('public.post_chapter_profile_v1_id_seq'::regclass);


--
-- Name: pre_chapter_profile_v1 id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pre_chapter_profile_v1 ALTER COLUMN id SET DEFAULT nextval('public.pre_chapter_profile_v1_id_seq'::regclass);


--
-- Name: priority_override_rules_v1 id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.priority_override_rules_v1 ALTER COLUMN id SET DEFAULT nextval('public.priority_override_rules_v1_id_seq'::regclass);


--
-- Name: review_apply_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.review_apply_log ALTER COLUMN id SET DEFAULT nextval('public.review_apply_log_id_seq'::regclass);


--
-- Name: review_request id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.review_request ALTER COLUMN id SET DEFAULT nextval('public.review_request_id_seq'::regclass);


--
-- Name: review_response id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.review_response ALTER COLUMN id SET DEFAULT nextval('public.review_response_id_seq'::regclass);


--
-- Name: shadow_run_pair id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shadow_run_pair ALTER COLUMN id SET DEFAULT nextval('public.shadow_run_pair_id_seq'::regclass);


--
-- Name: split_feedback id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.split_feedback ALTER COLUMN id SET DEFAULT nextval('public.split_feedback_id_seq'::regclass);


--
-- Name: story_active_analysis_scope_snapshot id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_active_analysis_scope_snapshot ALTER COLUMN id SET DEFAULT nextval('public.story_active_analysis_scope_snapshot_id_seq'::regclass);


--
-- Name: story_active_analysis_snapshot id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_active_analysis_snapshot ALTER COLUMN id SET DEFAULT nextval('public.story_active_analysis_snapshot_id_seq'::regclass);


--
-- Name: story_arc id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_arc ALTER COLUMN id SET DEFAULT nextval('public.story_arc_id_seq'::regclass);


--
-- Name: story_beat id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_beat ALTER COLUMN id SET DEFAULT nextval('public.story_beat_id_seq'::regclass);


--
-- Name: story_canon_fact id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_canon_fact ALTER COLUMN id SET DEFAULT nextval('public.story_canon_fact_id_seq'::regclass);


--
-- Name: story_caution id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_caution ALTER COLUMN id SET DEFAULT nextval('public.story_caution_id_seq'::regclass);


--
-- Name: story_chapter id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_chapter ALTER COLUMN id SET DEFAULT nextval('public.story_chapter_id_seq'::regclass);


--
-- Name: story_dictionary id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_dictionary ALTER COLUMN id SET DEFAULT nextval('public.story_dictionary_id_seq'::regclass);


--
-- Name: story_image id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_image ALTER COLUMN id SET DEFAULT nextval('public.story_image_id_seq'::regclass);


--
-- Name: story_map_version id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_map_version ALTER COLUMN id SET DEFAULT nextval('public.story_map_version_id_seq'::regclass);


--
-- Name: story_milestone id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_milestone ALTER COLUMN id SET DEFAULT nextval('public.story_milestone_id_seq'::regclass);


--
-- Name: story_scene_map id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_scene_map ALTER COLUMN id SET DEFAULT nextval('public.story_scene_map_id_seq'::regclass);


--
-- Name: story_series id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_series ALTER COLUMN id SET DEFAULT nextval('public.story_series_id_seq'::regclass);


--
-- Name: story_tag id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_tag ALTER COLUMN id SET DEFAULT nextval('public.story_tag_id_seq'::regclass);


--
-- Name: story_thread id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_thread ALTER COLUMN id SET DEFAULT nextval('public.story_thread_id_seq'::regclass);


--
-- Name: story_worldbuilding_note id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_worldbuilding_note ALTER COLUMN id SET DEFAULT nextval('public.story_worldbuilding_note_id_seq'::regclass);


--
-- Name: style_profile_scene id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.style_profile_scene ALTER COLUMN id SET DEFAULT nextval('public.style_profile_scene_id_seq'::regclass);


--
-- Name: supervisor_memory id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supervisor_memory ALTER COLUMN id SET DEFAULT nextval('public.supervisor_memory_id_seq'::regclass);


--
-- Name: taxonomy_hotfix_event id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.taxonomy_hotfix_event ALTER COLUMN id SET DEFAULT nextval('public.taxonomy_hotfix_event_id_seq'::regclass);


--
-- Name: taxonomy_rule_pack_compatibility id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.taxonomy_rule_pack_compatibility ALTER COLUMN id SET DEFAULT nextval('public.taxonomy_rule_pack_compatibility_id_seq'::regclass);


--
-- Name: thread_state_v1 id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.thread_state_v1 ALTER COLUMN id SET DEFAULT nextval('public.thread_state_v1_id_seq'::regclass);


--
-- Name: timeline_anchor id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timeline_anchor ALTER COLUMN id SET DEFAULT nextval('public.timeline_anchor_id_seq'::regclass);


--
-- Name: timeline_event id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timeline_event ALTER COLUMN id SET DEFAULT nextval('public.timeline_event_id_seq'::regclass);


--
-- Name: token_change_audit_event id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.token_change_audit_event ALTER COLUMN id SET DEFAULT nextval('public.token_change_audit_event_id_seq'::regclass);


--
-- Name: truth_adjudication_snapshot_v1 id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.truth_adjudication_snapshot_v1 ALTER COLUMN id SET DEFAULT nextval('public.truth_adjudication_snapshot_v1_id_seq'::regclass);


--
-- Name: truth_conflict_registry id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.truth_conflict_registry ALTER COLUMN id SET DEFAULT nextval('public.truth_conflict_registry_id_seq'::regclass);


--
-- Name: validate_rule_feedback id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.validate_rule_feedback ALTER COLUMN id SET DEFAULT nextval('public.validate_rule_feedback_id_seq'::regclass);


--
-- Name: writing_analysis_staging id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.writing_analysis_staging ALTER COLUMN id SET DEFAULT nextval('public.writing_analysis_staging_id_seq'::regclass);


--
-- Name: writing_scope_snapshot_v1 id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.writing_scope_snapshot_v1 ALTER COLUMN id SET DEFAULT nextval('public.writing_scope_snapshot_v1_id_seq'::regclass);


--
-- Name: writing_snapshot_v3 id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.writing_snapshot_v3 ALTER COLUMN id SET DEFAULT nextval('public.writing_snapshot_v3_id_seq'::regclass);


--
-- Name: agent_context_snapshot agent_context_snapshot_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_context_snapshot
    ADD CONSTRAINT agent_context_snapshot_pkey PRIMARY KEY (id);


--
-- Name: agent_equipment_slots agent_equipment_slots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_equipment_slots
    ADD CONSTRAINT agent_equipment_slots_pkey PRIMARY KEY (id);


--
-- Name: agent_feedback_loop agent_feedback_loop_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_feedback_loop
    ADD CONSTRAINT agent_feedback_loop_pkey PRIMARY KEY (id);


--
-- Name: agent_janitor_task agent_janitor_task_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_janitor_task
    ADD CONSTRAINT agent_janitor_task_pkey PRIMARY KEY (id);


--
-- Name: agent_memory_vector agent_memory_vector_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_memory_vector
    ADD CONSTRAINT agent_memory_vector_pkey PRIMARY KEY (id);


--
-- Name: agent_profile_event agent_profile_event_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_profile_event
    ADD CONSTRAINT agent_profile_event_pkey PRIMARY KEY (id);


--
-- Name: agent_profiles agent_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_profiles
    ADD CONSTRAINT agent_profiles_pkey PRIMARY KEY (id);


--
-- Name: agent_prompt_experiment agent_prompt_experiment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_prompt_experiment
    ADD CONSTRAINT agent_prompt_experiment_pkey PRIMARY KEY (id);


--
-- Name: agent_prompt_hydration_trace agent_prompt_hydration_trace_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_prompt_hydration_trace
    ADD CONSTRAINT agent_prompt_hydration_trace_pkey PRIMARY KEY (id);


--
-- Name: agent_prompt_profile agent_prompt_profile_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_prompt_profile
    ADD CONSTRAINT agent_prompt_profile_pkey PRIMARY KEY (id);


--
-- Name: agent_prompt_version agent_prompt_version_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_prompt_version
    ADD CONSTRAINT agent_prompt_version_pkey PRIMARY KEY (id);


--
-- Name: agent_prompt_version agent_prompt_version_profile_version_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_prompt_version
    ADD CONSTRAINT agent_prompt_version_profile_version_unique UNIQUE (profile_id, version_no);


--
-- Name: agent_run_trace agent_run_trace_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_run_trace
    ADD CONSTRAINT agent_run_trace_pkey PRIMARY KEY (id);


--
-- Name: agent_tuning_event agent_tuning_event_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_tuning_event
    ADD CONSTRAINT agent_tuning_event_pkey PRIMARY KEY (id);


--
-- Name: analysis_delta_report_v1 analysis_delta_report_v1_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.analysis_delta_report_v1
    ADD CONSTRAINT analysis_delta_report_v1_pkey PRIMARY KEY (id);


--
-- Name: author_annotation_v1 author_annotation_v1_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.author_annotation_v1
    ADD CONSTRAINT author_annotation_v1_pkey PRIMARY KEY (annotation_id);


--
-- Name: author_style_profile author_style_profile_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.author_style_profile
    ADD CONSTRAINT author_style_profile_pkey PRIMARY KEY (story_id);


--
-- Name: autowrite_cutover_state_v1 autowrite_cutover_state_v1_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.autowrite_cutover_state_v1
    ADD CONSTRAINT autowrite_cutover_state_v1_pkey PRIMARY KEY (story_id);


--
-- Name: canon_fact canon_fact_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.canon_fact
    ADD CONSTRAINT canon_fact_pkey PRIMARY KEY (id);


--
-- Name: canon_moltbook_agent_profile canon_moltbook_agent_profile_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.canon_moltbook_agent_profile
    ADD CONSTRAINT canon_moltbook_agent_profile_pkey PRIMARY KEY (agent_name);


--
-- Name: chapter_continuity_issue chapter_continuity_issue_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chapter_continuity_issue
    ADD CONSTRAINT chapter_continuity_issue_pkey PRIMARY KEY (id);


--
-- Name: chapter_draft chapter_draft_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chapter_draft
    ADD CONSTRAINT chapter_draft_pkey PRIMARY KEY (id);


--
-- Name: chapter_ledger chapter_ledger_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chapter_ledger
    ADD CONSTRAINT chapter_ledger_pkey PRIMARY KEY (id);


--
-- Name: core_memory_vetting_event core_memory_vetting_event_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.core_memory_vetting_event
    ADD CONSTRAINT core_memory_vetting_event_pkey PRIMARY KEY (id);


--
-- Name: core_memory_vetting_state core_memory_vetting_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.core_memory_vetting_state
    ADD CONSTRAINT core_memory_vetting_state_pkey PRIMARY KEY (id);


--
-- Name: core_memory_vetting_state core_memory_vetting_state_story_id_source_kind_source_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.core_memory_vetting_state
    ADD CONSTRAINT core_memory_vetting_state_story_id_source_kind_source_id_key UNIQUE (story_id, source_kind, source_id);


--
-- Name: entity_conflict_review_event entity_conflict_review_event_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_conflict_review_event
    ADD CONSTRAINT entity_conflict_review_event_pkey PRIMARY KEY (id);


--
-- Name: entity_conflict_review entity_conflict_review_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_conflict_review
    ADD CONSTRAINT entity_conflict_review_pkey PRIMARY KEY (id);


--
-- Name: entity_merge_challenge_v1 entity_merge_challenge_v1_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_merge_challenge_v1
    ADD CONSTRAINT entity_merge_challenge_v1_pkey PRIMARY KEY (id);


--
-- Name: entity_resolution_snapshot_v1 entity_resolution_snapshot_v1_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_resolution_snapshot_v1
    ADD CONSTRAINT entity_resolution_snapshot_v1_pkey PRIMARY KEY (id);


--
-- Name: entity_truth_overlay entity_truth_overlay_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_truth_overlay
    ADD CONSTRAINT entity_truth_overlay_pkey PRIMARY KEY (id);


--
-- Name: ingest_job ingest_job_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ingest_job
    ADD CONSTRAINT ingest_job_pkey PRIMARY KEY (id);


--
-- Name: ingest_task ingest_task_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ingest_task
    ADD CONSTRAINT ingest_task_pkey PRIMARY KEY (id);


--
-- Name: memory_enrich_task memory_enrich_task_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.memory_enrich_task
    ADD CONSTRAINT memory_enrich_task_pkey PRIMARY KEY (id);


--
-- Name: memory_enrich_task memory_enrich_task_scene_version_id_algo_version_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.memory_enrich_task
    ADD CONSTRAINT memory_enrich_task_scene_version_id_algo_version_key UNIQUE (scene_version_id, algo_version);


--
-- Name: metrics_moltbook_run metrics_moltbook_run_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.metrics_moltbook_run
    ADD CONSTRAINT metrics_moltbook_run_pkey PRIMARY KEY (id);


--
-- Name: muse_analysis muse_analysis_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.muse_analysis
    ADD CONSTRAINT muse_analysis_pkey PRIMARY KEY (id);


--
-- Name: muse_rules muse_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.muse_rules
    ADD CONSTRAINT muse_rules_pkey PRIMARY KEY (id);


--
-- Name: muse_snapshots muse_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.muse_snapshots
    ADD CONSTRAINT muse_snapshots_pkey PRIMARY KEY (id);


--
-- Name: narrative_chapter_staging narrative_chapter_staging_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.narrative_chapter_staging
    ADD CONSTRAINT narrative_chapter_staging_pkey PRIMARY KEY (id);


--
-- Name: narrative_chapter_staging narrative_chapter_staging_story_id_chapter_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.narrative_chapter_staging
    ADD CONSTRAINT narrative_chapter_staging_story_id_chapter_id_key UNIQUE (story_id, chapter_id);


--
-- Name: narrative_moltbook_comment_log narrative_moltbook_comment_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.narrative_moltbook_comment_log
    ADD CONSTRAINT narrative_moltbook_comment_log_pkey PRIMARY KEY (id);


--
-- Name: narrative_moltbook_interaction_log narrative_moltbook_interaction_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.narrative_moltbook_interaction_log
    ADD CONSTRAINT narrative_moltbook_interaction_log_pkey PRIMARY KEY (id);


--
-- Name: narrative_moltbook_post_log narrative_moltbook_post_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.narrative_moltbook_post_log
    ADD CONSTRAINT narrative_moltbook_post_log_pkey PRIMARY KEY (id);


--
-- Name: narrative_pipeline_run narrative_pipeline_run_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.narrative_pipeline_run
    ADD CONSTRAINT narrative_pipeline_run_pkey PRIMARY KEY (id);


--
-- Name: narrative_scene narrative_scene_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.narrative_scene
    ADD CONSTRAINT narrative_scene_pkey PRIMARY KEY (id);


--
-- Name: narrative_scene_state narrative_scene_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.narrative_scene_state
    ADD CONSTRAINT narrative_scene_state_pkey PRIMARY KEY (id);


--
-- Name: narrative_scene_state narrative_scene_state_scene_version_id_algo_version_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.narrative_scene_state
    ADD CONSTRAINT narrative_scene_state_scene_version_id_algo_version_key UNIQUE (scene_version_id, algo_version);


--
-- Name: narrative_scene_version narrative_scene_version_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.narrative_scene_version
    ADD CONSTRAINT narrative_scene_version_pkey PRIMARY KEY (id);


--
-- Name: pack_budget_policy_v1 pack_budget_policy_v1_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pack_budget_policy_v1
    ADD CONSTRAINT pack_budget_policy_v1_pkey PRIMARY KEY (id);


--
-- Name: pipeline_node_event pipeline_node_event_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pipeline_node_event
    ADD CONSTRAINT pipeline_node_event_pkey PRIMARY KEY (id);


--
-- Name: pipeline_node_type pipeline_node_type_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pipeline_node_type
    ADD CONSTRAINT pipeline_node_type_pkey PRIMARY KEY (type_slug);


--
-- Name: post_chapter_profile_v1 post_chapter_profile_v1_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_chapter_profile_v1
    ADD CONSTRAINT post_chapter_profile_v1_pkey PRIMARY KEY (id);


--
-- Name: pre_chapter_profile_v1 pre_chapter_profile_v1_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pre_chapter_profile_v1
    ADD CONSTRAINT pre_chapter_profile_v1_pkey PRIMARY KEY (id);


--
-- Name: priority_override_rules_v1 priority_override_rules_v1_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.priority_override_rules_v1
    ADD CONSTRAINT priority_override_rules_v1_pkey PRIMARY KEY (id);


--
-- Name: review_apply_log review_apply_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.review_apply_log
    ADD CONSTRAINT review_apply_log_pkey PRIMARY KEY (id);


--
-- Name: review_request review_request_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.review_request
    ADD CONSTRAINT review_request_pkey PRIMARY KEY (id);


--
-- Name: review_response review_response_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.review_response
    ADD CONSTRAINT review_response_pkey PRIMARY KEY (id);


--
-- Name: schema_migration schema_migration_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migration
    ADD CONSTRAINT schema_migration_pkey PRIMARY KEY (filename);


--
-- Name: shadow_run_pair shadow_run_pair_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shadow_run_pair
    ADD CONSTRAINT shadow_run_pair_pkey PRIMARY KEY (id);


--
-- Name: source_doc source_doc_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.source_doc
    ADD CONSTRAINT source_doc_pkey PRIMARY KEY (id);


--
-- Name: split_feedback split_feedback_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.split_feedback
    ADD CONSTRAINT split_feedback_pkey PRIMARY KEY (id);


--
-- Name: split_strategy_profile split_strategy_profile_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.split_strategy_profile
    ADD CONSTRAINT split_strategy_profile_pkey PRIMARY KEY (story_id, chapter_id);


--
-- Name: story_active_analysis_scope_snapshot story_active_analysis_scope_s_story_id_scope_type_scope_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_active_analysis_scope_snapshot
    ADD CONSTRAINT story_active_analysis_scope_s_story_id_scope_type_scope_key_key UNIQUE (story_id, scope_type, scope_key);


--
-- Name: story_active_analysis_scope_snapshot story_active_analysis_scope_snapshot_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_active_analysis_scope_snapshot
    ADD CONSTRAINT story_active_analysis_scope_snapshot_pkey PRIMARY KEY (id);


--
-- Name: story_active_analysis_snapshot story_active_analysis_snapshot_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_active_analysis_snapshot
    ADD CONSTRAINT story_active_analysis_snapshot_pkey PRIMARY KEY (id);


--
-- Name: story_active_analysis_snapshot story_active_analysis_snapshot_story_id_chapter_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_active_analysis_snapshot
    ADD CONSTRAINT story_active_analysis_snapshot_story_id_chapter_id_key UNIQUE (story_id, chapter_id);


--
-- Name: story_arc story_arc_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_arc
    ADD CONSTRAINT story_arc_pkey PRIMARY KEY (id);


--
-- Name: story_arc story_arc_story_id_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_arc
    ADD CONSTRAINT story_arc_story_id_slug_key UNIQUE (story_id, slug);


--
-- Name: story_beat story_beat_map_version_id_scene_id_beat_idx_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_beat
    ADD CONSTRAINT story_beat_map_version_id_scene_id_beat_idx_key UNIQUE (map_version_id, scene_id, beat_idx);


--
-- Name: story_beat story_beat_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_beat
    ADD CONSTRAINT story_beat_pkey PRIMARY KEY (id);


--
-- Name: story_canon_fact story_canon_fact_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_canon_fact
    ADD CONSTRAINT story_canon_fact_pkey PRIMARY KEY (id);


--
-- Name: story_caution story_caution_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_caution
    ADD CONSTRAINT story_caution_pkey PRIMARY KEY (id);


--
-- Name: story_caution story_caution_story_id_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_caution
    ADD CONSTRAINT story_caution_story_id_code_key UNIQUE (story_id, code);


--
-- Name: story_chapter story_chapter_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_chapter
    ADD CONSTRAINT story_chapter_pkey PRIMARY KEY (id);


--
-- Name: story_dictionary story_dictionary_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_dictionary
    ADD CONSTRAINT story_dictionary_pkey PRIMARY KEY (id);


--
-- Name: story_image story_image_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_image
    ADD CONSTRAINT story_image_pkey PRIMARY KEY (id);


--
-- Name: story_map_state story_map_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_map_state
    ADD CONSTRAINT story_map_state_pkey PRIMARY KEY (story_id);


--
-- Name: story_map_version story_map_version_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_map_version
    ADD CONSTRAINT story_map_version_pkey PRIMARY KEY (id);


--
-- Name: story_map_version story_map_version_story_id_version_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_map_version
    ADD CONSTRAINT story_map_version_story_id_version_no_key UNIQUE (story_id, version_no);


--
-- Name: story_milestone story_milestone_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_milestone
    ADD CONSTRAINT story_milestone_pkey PRIMARY KEY (id);


--
-- Name: story_quality_policy story_quality_policy_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_quality_policy
    ADD CONSTRAINT story_quality_policy_pkey PRIMARY KEY (story_id);


--
-- Name: story_scene_map story_scene_map_map_version_id_scene_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_scene_map
    ADD CONSTRAINT story_scene_map_map_version_id_scene_id_key UNIQUE (map_version_id, scene_id);


--
-- Name: story_scene_map story_scene_map_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_scene_map
    ADD CONSTRAINT story_scene_map_pkey PRIMARY KEY (id);


--
-- Name: story_series story_series_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_series
    ADD CONSTRAINT story_series_pkey PRIMARY KEY (id);


--
-- Name: story_series story_series_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_series
    ADD CONSTRAINT story_series_slug_key UNIQUE (slug);


--
-- Name: story_style_profile story_style_profile_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_style_profile
    ADD CONSTRAINT story_style_profile_pkey PRIMARY KEY (story_id);


--
-- Name: story_tag story_tag_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_tag
    ADD CONSTRAINT story_tag_pkey PRIMARY KEY (id);


--
-- Name: story_tag story_tag_story_id_tag_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_tag
    ADD CONSTRAINT story_tag_story_id_tag_key UNIQUE (story_id, tag);


--
-- Name: story_thread story_thread_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_thread
    ADD CONSTRAINT story_thread_pkey PRIMARY KEY (id);


--
-- Name: story_thread story_thread_story_id_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_thread
    ADD CONSTRAINT story_thread_story_id_slug_key UNIQUE (story_id, slug);


--
-- Name: story_worldbuilding_note story_worldbuilding_note_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_worldbuilding_note
    ADD CONSTRAINT story_worldbuilding_note_pkey PRIMARY KEY (id);


--
-- Name: style_profile_scene style_profile_scene_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.style_profile_scene
    ADD CONSTRAINT style_profile_scene_pkey PRIMARY KEY (id);


--
-- Name: style_profile_scene style_profile_scene_scene_version_id_algo_version_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.style_profile_scene
    ADD CONSTRAINT style_profile_scene_scene_version_id_algo_version_key UNIQUE (scene_version_id, algo_version);


--
-- Name: supervisor_memory supervisor_memory_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supervisor_memory
    ADD CONSTRAINT supervisor_memory_pkey PRIMARY KEY (id);


--
-- Name: supervisor_memory supervisor_memory_story_task_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supervisor_memory
    ADD CONSTRAINT supervisor_memory_story_task_unique UNIQUE (story_id, chapter_task_id);


--
-- Name: system_heartbeat system_heartbeat_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_heartbeat
    ADD CONSTRAINT system_heartbeat_pkey PRIMARY KEY (key);


--
-- Name: taxonomy_hotfix_event taxonomy_hotfix_event_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.taxonomy_hotfix_event
    ADD CONSTRAINT taxonomy_hotfix_event_pkey PRIMARY KEY (id);


--
-- Name: taxonomy_rule_pack_compatibility taxonomy_rule_pack_compatibil_taxonomy_version_rule_pack_ve_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.taxonomy_rule_pack_compatibility
    ADD CONSTRAINT taxonomy_rule_pack_compatibil_taxonomy_version_rule_pack_ve_key UNIQUE (taxonomy_version, rule_pack_version);


--
-- Name: taxonomy_rule_pack_compatibility taxonomy_rule_pack_compatibility_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.taxonomy_rule_pack_compatibility
    ADD CONSTRAINT taxonomy_rule_pack_compatibility_pkey PRIMARY KEY (id);


--
-- Name: thread_state_v1 thread_state_v1_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.thread_state_v1
    ADD CONSTRAINT thread_state_v1_pkey PRIMARY KEY (id);


--
-- Name: thread_state_v1 thread_state_v1_story_id_thread_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.thread_state_v1
    ADD CONSTRAINT thread_state_v1_story_id_thread_id_key UNIQUE (story_id, thread_id);


--
-- Name: timeline_anchor timeline_anchor_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timeline_anchor
    ADD CONSTRAINT timeline_anchor_pkey PRIMARY KEY (id);


--
-- Name: timeline_event timeline_event_event_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timeline_event
    ADD CONSTRAINT timeline_event_event_key_key UNIQUE (event_key);


--
-- Name: timeline_event timeline_event_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timeline_event
    ADD CONSTRAINT timeline_event_pkey PRIMARY KEY (id);


--
-- Name: token_change_audit_event token_change_audit_event_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.token_change_audit_event
    ADD CONSTRAINT token_change_audit_event_pkey PRIMARY KEY (id);


--
-- Name: truth_adjudication_snapshot_v1 truth_adjudication_snapshot_v1_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.truth_adjudication_snapshot_v1
    ADD CONSTRAINT truth_adjudication_snapshot_v1_pkey PRIMARY KEY (id);


--
-- Name: truth_conflict_registry truth_conflict_registry_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.truth_conflict_registry
    ADD CONSTRAINT truth_conflict_registry_pkey PRIMARY KEY (id);


--
-- Name: chapter_draft uq_chapter_draft_chapter; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chapter_draft
    ADD CONSTRAINT uq_chapter_draft_chapter UNIQUE (story_id, chapter_id);


--
-- Name: chapter_draft uq_chapter_draft_version; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chapter_draft
    ADD CONSTRAINT uq_chapter_draft_version UNIQUE (story_id, chapter_id, version_no);


--
-- Name: chapter_ledger uq_chapter_ledger_chapter; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chapter_ledger
    ADD CONSTRAINT uq_chapter_ledger_chapter UNIQUE (story_id, chapter_id);


--
-- Name: story_chapter uq_story_chapter_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_chapter
    ADD CONSTRAINT uq_story_chapter_id UNIQUE (story_id, chapter_id);


--
-- Name: validate_rule_feedback validate_rule_feedback_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.validate_rule_feedback
    ADD CONSTRAINT validate_rule_feedback_pkey PRIMARY KEY (id);


--
-- Name: writing_analysis_staging writing_analysis_staging_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.writing_analysis_staging
    ADD CONSTRAINT writing_analysis_staging_pkey PRIMARY KEY (id);


--
-- Name: writing_scope_snapshot_v1 writing_scope_snapshot_v1_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.writing_scope_snapshot_v1
    ADD CONSTRAINT writing_scope_snapshot_v1_pkey PRIMARY KEY (id);


--
-- Name: writing_snapshot_v3 writing_snapshot_v3_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.writing_snapshot_v3
    ADD CONSTRAINT writing_snapshot_v3_pkey PRIMARY KEY (id);


--
-- Name: writing_snapshot_v3 writing_snapshot_v3_snapshot_json_object_check; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.writing_snapshot_v3
    ADD CONSTRAINT writing_snapshot_v3_snapshot_json_object_check CHECK ((jsonb_typeof(snapshot_json) = 'object'::text)) NOT VALID;


--
-- Name: agent_context_snapshot_story_chapter_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agent_context_snapshot_story_chapter_created_idx ON public.agent_context_snapshot USING btree (story_id, chapter_id, created_at DESC);


--
-- Name: agent_feedback_loop_story_agent_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agent_feedback_loop_story_agent_created_idx ON public.agent_feedback_loop USING btree (story_id, agent_name, created_at DESC);


--
-- Name: agent_memory_vector_story_agent_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agent_memory_vector_story_agent_created_idx ON public.agent_memory_vector USING btree (story_id, agent_name, created_at DESC);


--
-- Name: agent_prompt_experiment_lookup_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agent_prompt_experiment_lookup_idx ON public.agent_prompt_experiment USING btree (agent_name, scope, COALESCE(story_id, (0)::bigint), COALESCE(chapter_id, ''::text), status, start_at DESC);


--
-- Name: agent_prompt_profile_scope_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX agent_prompt_profile_scope_unique_idx ON public.agent_prompt_profile USING btree (agent_name, scope, COALESCE(story_id, (0)::bigint), COALESCE(chapter_id, ''::text));


--
-- Name: agent_prompt_version_profile_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agent_prompt_version_profile_status_idx ON public.agent_prompt_version USING btree (profile_id, status, created_at DESC);


--
-- Name: agent_run_trace_mode_transition_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agent_run_trace_mode_transition_idx ON public.agent_run_trace USING btree (token_key, original_detection_mode, current_detection_mode, created_at DESC);


--
-- Name: agent_run_trace_prompt_version_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agent_run_trace_prompt_version_created_idx ON public.agent_run_trace USING btree (prompt_version_id, created_at DESC);


--
-- Name: agent_run_trace_story_agent_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agent_run_trace_story_agent_created_idx ON public.agent_run_trace USING btree (story_id, agent_name, created_at DESC);


--
-- Name: agent_run_trace_story_chapter_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agent_run_trace_story_chapter_created_idx ON public.agent_run_trace USING btree (story_id, chapter_id, created_at DESC);


--
-- Name: agent_run_trace_version_pair_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agent_run_trace_version_pair_created_idx ON public.agent_run_trace USING btree (taxonomy_version, rule_pack_version, created_at DESC);


--
-- Name: agent_tuning_event_agent_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agent_tuning_event_agent_created_idx ON public.agent_tuning_event USING btree (agent_name, created_at DESC);


--
-- Name: analysis_delta_report_v1_story_chapter_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX analysis_delta_report_v1_story_chapter_idx ON public.analysis_delta_report_v1 USING btree (story_id, chapter_id, created_at DESC);


--
-- Name: author_annotation_v1_story_chapter_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX author_annotation_v1_story_chapter_status_idx ON public.author_annotation_v1 USING btree (story_id, chapter_id, status, created_at DESC);


--
-- Name: author_style_profile_updated_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX author_style_profile_updated_at_idx ON public.author_style_profile USING btree (updated_at DESC);


--
-- Name: core_memory_vetting_event_story_source_time_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX core_memory_vetting_event_story_source_time_idx ON public.core_memory_vetting_event USING btree (story_id, source_kind, source_id, created_at DESC);


--
-- Name: core_memory_vetting_state_story_status_kind_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX core_memory_vetting_state_story_status_kind_idx ON public.core_memory_vetting_state USING btree (story_id, review_status, source_kind, updated_at DESC);


--
-- Name: entity_merge_challenge_v1_story_chapter_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX entity_merge_challenge_v1_story_chapter_status_idx ON public.entity_merge_challenge_v1 USING btree (story_id, chapter_id, status, created_at DESC);


--
-- Name: entity_resolution_snapshot_v1_cache_key_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX entity_resolution_snapshot_v1_cache_key_idx ON public.entity_resolution_snapshot_v1 USING btree (cache_key);


--
-- Name: entity_resolution_snapshot_v1_story_chapter_cache_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX entity_resolution_snapshot_v1_story_chapter_cache_uniq ON public.entity_resolution_snapshot_v1 USING btree (story_id, chapter_id, cache_key);


--
-- Name: idx_agent_equipment_slots_profile_story; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_equipment_slots_profile_story ON public.agent_equipment_slots USING btree (agent_profile_id, story_id);


--
-- Name: idx_agent_equipment_slots_story_slot; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_equipment_slots_story_slot ON public.agent_equipment_slots USING btree (story_id, slot_type, is_active);


--
-- Name: idx_agent_janitor_task_poll; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_janitor_task_poll ON public.agent_janitor_task USING btree (status, available_at, id);


--
-- Name: idx_agent_profile_event_profile_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_profile_event_profile_created ON public.agent_profile_event USING btree (agent_profile_id, created_at DESC);


--
-- Name: idx_agent_profile_event_story_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_profile_event_story_created ON public.agent_profile_event USING btree (story_id, created_at DESC);


--
-- Name: idx_agent_profiles_level; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_profiles_level ON public.agent_profiles USING btree (level DESC);


--
-- Name: idx_agent_profiles_species; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_profiles_species ON public.agent_profiles USING btree (species_name);


--
-- Name: idx_agent_prompt_hydration_trace_prompt_version; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_prompt_hydration_trace_prompt_version ON public.agent_prompt_hydration_trace USING btree (prompt_version_id);


--
-- Name: idx_agent_prompt_hydration_trace_run_trace; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_prompt_hydration_trace_run_trace ON public.agent_prompt_hydration_trace USING btree (run_trace_id);


--
-- Name: idx_agent_prompt_hydration_trace_story_agent_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_prompt_hydration_trace_story_agent_created ON public.agent_prompt_hydration_trace USING btree (story_id, agent_name, created_at DESC);


--
-- Name: idx_agent_run_trace_profile_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_run_trace_profile_created ON public.agent_run_trace USING btree (agent_profile_id, created_at DESC);


--
-- Name: idx_agent_run_trace_strategy_profile_version_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_run_trace_strategy_profile_version_created ON public.agent_run_trace USING btree (strategy_profile_version_id, created_at DESC);


--
-- Name: idx_canon_fact_scene; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_canon_fact_scene ON public.canon_fact USING btree (scene_id);


--
-- Name: idx_canon_fact_scene_version; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_canon_fact_scene_version ON public.canon_fact USING btree (scene_version_id);


--
-- Name: idx_canon_fact_story_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_canon_fact_story_created ON public.canon_fact USING btree (story_id, created_at DESC);


--
-- Name: idx_chapter_continuity_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chapter_continuity_lookup ON public.chapter_continuity_issue USING btree (story_id, chapter_id);


--
-- Name: idx_chapter_draft_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chapter_draft_lookup ON public.chapter_draft USING btree (story_id, chapter_id, status);


--
-- Name: idx_chapter_ledger_story; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chapter_ledger_story ON public.chapter_ledger USING btree (story_id);


--
-- Name: idx_entity_conflict_review_event_story_review; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_entity_conflict_review_event_story_review ON public.entity_conflict_review_event USING btree (story_id, review_id, created_at DESC);


--
-- Name: idx_entity_conflict_review_story_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_entity_conflict_review_story_entity ON public.entity_conflict_review USING btree (story_id, entity_key, created_at DESC);


--
-- Name: idx_entity_conflict_review_story_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_entity_conflict_review_story_status ON public.entity_conflict_review USING btree (story_id, status, created_at DESC);


--
-- Name: idx_entity_truth_overlay_story_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_entity_truth_overlay_story_entity ON public.entity_truth_overlay USING btree (story_id, entity_key);


--
-- Name: idx_entity_truth_overlay_story_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_entity_truth_overlay_story_role ON public.entity_truth_overlay USING btree (story_id, canonical_role, updated_at DESC);


--
-- Name: idx_ingest_job_story_run; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ingest_job_story_run ON public.ingest_job USING btree (story_id, ingest_run_id, created_at DESC);


--
-- Name: idx_ingest_job_story_status_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ingest_job_story_status_time ON public.ingest_job USING btree (story_id, status, created_at DESC);


--
-- Name: idx_ingest_task_depends; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ingest_task_depends ON public.ingest_task USING btree (depends_on_task_id) WHERE (depends_on_task_id IS NOT NULL);


--
-- Name: idx_ingest_task_job_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ingest_task_job_status ON public.ingest_task USING btree (job_id, status, seq_no);


--
-- Name: idx_ingest_task_poll; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ingest_task_poll ON public.ingest_task USING btree (status, updated_at, id);


--
-- Name: idx_ingest_task_story_type_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ingest_task_story_type_status ON public.ingest_task USING btree (story_id, task_type, status, seq_no);


--
-- Name: idx_memory_enrich_task_poll; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_memory_enrich_task_poll ON public.memory_enrich_task USING btree (status, updated_at, id);


--
-- Name: idx_memory_enrich_task_story_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_memory_enrich_task_story_status ON public.memory_enrich_task USING btree (story_id, status, created_at DESC);


--
-- Name: idx_muse_analysis_story_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_muse_analysis_story_created ON public.muse_analysis USING btree (story_id, created_at DESC, id);


--
-- Name: idx_muse_analysis_story_scene_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_muse_analysis_story_scene_created ON public.muse_analysis USING btree (story_id, scene_id, created_at DESC, id);


--
-- Name: idx_muse_rules_story_active_weight; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_muse_rules_story_active_weight ON public.muse_rules USING btree (story_id, is_active, weight DESC, created_at DESC);


--
-- Name: idx_muse_rules_story_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_muse_rules_story_type ON public.muse_rules USING btree (story_id, type, is_active);


--
-- Name: idx_muse_snapshots_story_action; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_muse_snapshots_story_action ON public.muse_snapshots USING btree (story_id, action, created_at DESC);


--
-- Name: idx_muse_snapshots_story_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_muse_snapshots_story_created ON public.muse_snapshots USING btree (story_id, created_at DESC, id DESC);


--
-- Name: idx_narrative_moltbook_post_log_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_narrative_moltbook_post_log_uniq ON public.narrative_moltbook_post_log USING btree (submolt, post_id);


--
-- Name: idx_narrative_scene_story_ingest_run; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_narrative_scene_story_ingest_run ON public.narrative_scene USING btree (story_id, ingest_run_id) WHERE (ingest_run_id IS NOT NULL);


--
-- Name: idx_narrative_scene_verified; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_narrative_scene_verified ON public.narrative_scene USING btree (story_id, is_verified);


--
-- Name: idx_pipeline_run_scene_step_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pipeline_run_scene_step_time ON public.narrative_pipeline_run USING btree (scene_id, step, created_at DESC);


--
-- Name: idx_pipeline_run_story_step_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pipeline_run_story_step_time ON public.narrative_pipeline_run USING btree (story_id, step, created_at DESC);


--
-- Name: idx_review_apply_log_request; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_review_apply_log_request ON public.review_apply_log USING btree (request_id, applied_at DESC);


--
-- Name: idx_review_apply_log_response; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_review_apply_log_response ON public.review_apply_log USING btree (response_id);


--
-- Name: idx_review_request_story_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_review_request_story_status ON public.review_request USING btree (story_id, status, created_at DESC);


--
-- Name: idx_review_response_request_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_review_response_request_time ON public.review_response USING btree (request_id, created_at DESC);


--
-- Name: idx_scene_state_scene; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scene_state_scene ON public.narrative_scene_state USING btree (scene_id);


--
-- Name: idx_scene_state_story_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scene_state_story_created ON public.narrative_scene_state USING btree (story_id, created_at DESC);


--
-- Name: idx_scene_version_scene; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scene_version_scene ON public.narrative_scene_version USING btree (scene_id, created_at DESC);


--
-- Name: idx_scene_version_story_ingest_run; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scene_version_story_ingest_run ON public.narrative_scene_version USING btree (story_id, ingest_run_id) WHERE (ingest_run_id IS NOT NULL);


--
-- Name: idx_scene_version_story_scene_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scene_version_story_scene_time ON public.narrative_scene_version USING btree (story_id, scene_id, created_at DESC);


--
-- Name: idx_scene_version_tsv_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scene_version_tsv_gin ON public.narrative_scene_version USING gin (tsv);


--
-- Name: idx_scope_snapshot_story_scope_stale_updated; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scope_snapshot_story_scope_stale_updated ON public.writing_scope_snapshot_v1 USING btree (story_id, scope_type, is_stale, updated_at DESC);


--
-- Name: idx_shadow_run_pair_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_shadow_run_pair_status ON public.shadow_run_pair USING btree (pair_status, created_at DESC);


--
-- Name: idx_shadow_run_pair_story_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_shadow_run_pair_story_created ON public.shadow_run_pair USING btree (story_id, created_at DESC);


--
-- Name: idx_shadow_run_pair_task; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_shadow_run_pair_task ON public.shadow_run_pair USING btree (task_id, created_at DESC);


--
-- Name: idx_source_doc_doc_type_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_source_doc_doc_type_created ON public.source_doc USING btree (doc_type, created_at DESC);


--
-- Name: idx_source_doc_stable; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_source_doc_stable ON public.source_doc USING btree (story_id, is_stable);


--
-- Name: idx_source_doc_story_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_source_doc_story_created ON public.source_doc USING btree (story_id, created_at DESC);


--
-- Name: idx_story_arc_story_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_story_arc_story_order ON public.story_arc USING btree (story_id, order_no, id);


--
-- Name: idx_story_beat_scene_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_story_beat_scene_order ON public.story_beat USING btree (map_version_id, scene_id, beat_idx);


--
-- Name: idx_story_beat_thread_ids_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_story_beat_thread_ids_gin ON public.story_beat USING gin (thread_ids);


--
-- Name: idx_story_canon_fact_story_rank; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_story_canon_fact_story_rank ON public.story_canon_fact USING btree (story_id, importance DESC, updated_at DESC);


--
-- Name: idx_story_canon_fact_tsv_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_story_canon_fact_tsv_gin ON public.story_canon_fact USING gin (content_tsv);


--
-- Name: idx_story_caution_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_story_caution_code ON public.story_caution USING btree (lower(code));


--
-- Name: idx_story_caution_story; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_story_caution_story ON public.story_caution USING btree (story_id);


--
-- Name: idx_story_chapter_arc_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_story_chapter_arc_id ON public.story_chapter USING btree (arc_id);


--
-- Name: idx_story_chapter_story_arc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_story_chapter_story_arc ON public.story_chapter USING btree (story_id, arc_id);


--
-- Name: idx_story_chapter_story_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_story_chapter_story_id ON public.story_chapter USING btree (story_id);


--
-- Name: idx_story_dict_aliases; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_story_dict_aliases ON public.story_dictionary USING gin (aliases);


--
-- Name: idx_story_dict_story_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_story_dict_story_id ON public.story_dictionary USING btree (story_id);


--
-- Name: idx_story_dict_term_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_story_dict_term_key ON public.story_dictionary USING btree (term_key);


--
-- Name: idx_story_dict_tier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_story_dict_tier ON public.story_dictionary USING btree (tier);


--
-- Name: idx_story_image_story_kind_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_story_image_story_kind_order ON public.story_image USING btree (story_id, kind, sort_order, id);


--
-- Name: idx_story_map_version_story_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_story_map_version_story_created ON public.story_map_version USING btree (story_id, created_at DESC, id DESC);


--
-- Name: idx_story_milestone_story_stale_updated; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_story_milestone_story_stale_updated ON public.story_milestone USING btree (story_id, is_stale, updated_at DESC);


--
-- Name: idx_story_quality_policy_updated_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_story_quality_policy_updated_at ON public.story_quality_policy USING btree (updated_at DESC);


--
-- Name: idx_story_scene_map_version_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_story_scene_map_version_order ON public.story_scene_map USING btree (map_version_id, chapter_id, sequence_no, scene_id);


--
-- Name: idx_story_tag_story; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_story_tag_story ON public.story_tag USING btree (story_id);


--
-- Name: idx_story_tag_tag; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_story_tag_tag ON public.story_tag USING btree (lower(tag));


--
-- Name: idx_story_thread_story_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_story_thread_story_type ON public.story_thread USING btree (story_id, type, importance DESC, id);


--
-- Name: idx_style_profile_scene_scene; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_style_profile_scene_scene ON public.style_profile_scene USING btree (scene_id);


--
-- Name: idx_style_profile_scene_story_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_style_profile_scene_story_created ON public.style_profile_scene USING btree (story_id, created_at DESC);


--
-- Name: idx_timeline_anchor_scene; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_timeline_anchor_scene ON public.timeline_anchor USING btree (scene_id);


--
-- Name: idx_timeline_anchor_scene_version; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_timeline_anchor_scene_version ON public.timeline_anchor USING btree (scene_version_id);


--
-- Name: idx_timeline_anchor_story_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_timeline_anchor_story_created ON public.timeline_anchor USING btree (story_id, created_at DESC);


--
-- Name: idx_timeline_story_start_ts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_timeline_story_start_ts ON public.timeline_event USING btree (story_id, start_ts);


--
-- Name: idx_timeline_tsv_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_timeline_tsv_gin ON public.timeline_event USING gin (tsv);


--
-- Name: idx_truth_conflict_registry_chapter; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_truth_conflict_registry_chapter ON public.truth_conflict_registry USING btree (story_id, chapter_id, created_at DESC);


--
-- Name: idx_truth_conflict_registry_story_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_truth_conflict_registry_story_created ON public.truth_conflict_registry USING btree (story_id, created_at DESC);


--
-- Name: idx_truth_conflict_registry_task; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_truth_conflict_registry_task ON public.truth_conflict_registry USING btree (task_id, created_at DESC);


--
-- Name: idx_worldbuilding_story_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_worldbuilding_story_category ON public.story_worldbuilding_note USING btree (story_id, category, updated_at DESC);


--
-- Name: idx_worldbuilding_story_mode_rank; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_worldbuilding_story_mode_rank ON public.story_worldbuilding_note USING btree (story_id, injection_mode, importance DESC, updated_at DESC);


--
-- Name: idx_worldbuilding_tags_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_worldbuilding_tags_gin ON public.story_worldbuilding_note USING gin (tags);


--
-- Name: idx_worldbuilding_tsv_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_worldbuilding_tsv_gin ON public.story_worldbuilding_note USING gin (content_tsv);


--
-- Name: ingest_task_split_human_outcome_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ingest_task_split_human_outcome_idx ON public.ingest_task USING btree (story_id, task_type, status, human_outcome, updated_at DESC);


--
-- Name: narrative_scene_state_stale_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX narrative_scene_state_stale_idx ON public.narrative_scene_state USING btree (story_id, is_stale, stale_marked_at DESC);


--
-- Name: pack_budget_policy_v1_story_active_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX pack_budget_policy_v1_story_active_uniq ON public.pack_budget_policy_v1 USING btree (story_id) WHERE (is_active = true);


--
-- Name: pipeline_node_event_job_node_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pipeline_node_event_job_node_created_idx ON public.pipeline_node_event USING btree (job_id, node_key, created_at DESC);


--
-- Name: pipeline_node_event_status_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pipeline_node_event_status_created_idx ON public.pipeline_node_event USING btree (status, created_at DESC);


--
-- Name: pipeline_node_event_story_job_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pipeline_node_event_story_job_created_idx ON public.pipeline_node_event USING btree (story_id, job_id, created_at DESC);


--
-- Name: post_chapter_profile_v1_story_chapter_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX post_chapter_profile_v1_story_chapter_idx ON public.post_chapter_profile_v1 USING btree (story_id, chapter_id, created_at DESC);


--
-- Name: pre_chapter_profile_v1_story_chapter_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pre_chapter_profile_v1_story_chapter_idx ON public.pre_chapter_profile_v1 USING btree (story_id, chapter_id, created_at DESC);


--
-- Name: priority_override_rules_v1_scope_key_active_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX priority_override_rules_v1_scope_key_active_uniq ON public.priority_override_rules_v1 USING btree (COALESCE(story_id, (0)::bigint), rule_key) WHERE (is_active = true);


--
-- Name: split_feedback_boundary_ref_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX split_feedback_boundary_ref_idx ON public.split_feedback USING btree (story_id, chapter_id, boundary_scene_idx_left, boundary_scene_idx_right, created_at DESC);


--
-- Name: split_feedback_mode_transition_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX split_feedback_mode_transition_idx ON public.split_feedback USING btree (token_key, original_detection_mode, current_detection_mode, created_at DESC);


--
-- Name: split_feedback_quality_score_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX split_feedback_quality_score_idx ON public.split_feedback USING btree (story_id, chapter_id, feedback_quality_score, created_at DESC);


--
-- Name: split_feedback_reason_code_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX split_feedback_reason_code_created_idx ON public.split_feedback USING btree (reason_code, created_at DESC);


--
-- Name: split_feedback_story_chapter_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX split_feedback_story_chapter_created_idx ON public.split_feedback USING btree (story_id, chapter_id, created_at DESC);


--
-- Name: split_feedback_strategy_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX split_feedback_strategy_created_idx ON public.split_feedback USING btree (story_id, chapter_id, strategy, created_at DESC);


--
-- Name: split_feedback_version_pair_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX split_feedback_version_pair_created_idx ON public.split_feedback USING btree (taxonomy_version, rule_pack_version, created_at DESC);


--
-- Name: split_strategy_profile_updated_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX split_strategy_profile_updated_at_idx ON public.split_strategy_profile USING btree (updated_at DESC);


--
-- Name: story_active_analysis_scope_snapshot_story_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX story_active_analysis_scope_snapshot_story_idx ON public.story_active_analysis_scope_snapshot USING btree (story_id, scope_type, scope_key, updated_at DESC);


--
-- Name: story_active_analysis_snapshot_story_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX story_active_analysis_snapshot_story_idx ON public.story_active_analysis_snapshot USING btree (story_id, chapter_id, updated_at DESC);


--
-- Name: story_milestone_story_arc_range_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX story_milestone_story_arc_range_idx ON public.story_milestone USING btree (story_id, arc_id, chapter_from, chapter_to);


--
-- Name: story_milestone_story_chapter_to_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX story_milestone_story_chapter_to_idx ON public.story_milestone USING btree (story_id, chapter_to DESC, created_at DESC);


--
-- Name: story_milestone_story_range_source_hash_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX story_milestone_story_range_source_hash_uniq ON public.story_milestone USING btree (story_id, chapter_from, chapter_to, source_hash) WHERE ((source_hash IS NOT NULL) AND (source_hash <> ''::text));


--
-- Name: story_milestone_story_stale_chapter_to_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX story_milestone_story_stale_chapter_to_idx ON public.story_milestone USING btree (story_id, is_stale, chapter_to DESC, updated_at DESC);


--
-- Name: supervisor_memory_story_chapter_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX supervisor_memory_story_chapter_idx ON public.supervisor_memory USING btree (story_id, chapter_id, created_at DESC);


--
-- Name: supervisor_memory_story_label_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX supervisor_memory_story_label_idx ON public.supervisor_memory USING btree (story_id, label, created_at DESC);


--
-- Name: taxonomy_hotfix_event_pair_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX taxonomy_hotfix_event_pair_created_idx ON public.taxonomy_hotfix_event USING btree (taxonomy_version, rule_pack_version, created_at DESC);


--
-- Name: token_change_audit_token_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX token_change_audit_token_created_idx ON public.token_change_audit_event USING btree (token_key, created_at DESC);


--
-- Name: truth_adjudication_snapshot_v1_story_chapter_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX truth_adjudication_snapshot_v1_story_chapter_idx ON public.truth_adjudication_snapshot_v1 USING btree (story_id, chapter_id, created_at DESC);


--
-- Name: uq_agent_equipment_active_slot; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_agent_equipment_active_slot ON public.agent_equipment_slots USING btree (agent_profile_id, story_id, slot_type) WHERE (is_active = true);


--
-- Name: uq_agent_janitor_task_job; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_agent_janitor_task_job ON public.agent_janitor_task USING btree (job_id);


--
-- Name: uq_canon_fact_idempotency; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_canon_fact_idempotency ON public.canon_fact USING btree (scene_version_id, algo_version, subject, predicate, object);


--
-- Name: uq_ingest_task_job_seq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_ingest_task_job_seq ON public.ingest_task USING btree (job_id, seq_no);


--
-- Name: uq_ingest_task_story_type_idempotency; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_ingest_task_story_type_idempotency ON public.ingest_task USING btree (story_id, task_type, idempotency_key) WHERE ((idempotency_key IS NOT NULL) AND (idempotency_key <> ''::text));


--
-- Name: uq_scene_story_chapter_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_scene_story_chapter_idx ON public.narrative_scene USING btree (story_id, chapter_id, idx);


--
-- Name: uq_scene_story_version_no; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_scene_story_version_no ON public.narrative_scene_version USING btree (story_id, scene_id, version_no);


--
-- Name: uq_scene_story_workunit; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_scene_story_workunit ON public.narrative_scene USING btree (story_id, workunit_id);


--
-- Name: uq_scene_version_no; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_scene_version_no ON public.narrative_scene_version USING btree (scene_id, version_no);


--
-- Name: uq_source_doc_story_sha; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_source_doc_story_sha ON public.source_doc USING btree (story_id, raw_text_sha256);


--
-- Name: uq_story_image_story_cover; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_story_image_story_cover ON public.story_image USING btree (story_id, kind) WHERE (kind = 'cover'::text);


--
-- Name: uq_timeline_anchor_idempotency; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_timeline_anchor_idempotency ON public.timeline_anchor USING btree (scene_version_id, algo_version, event_label);


--
-- Name: validate_rule_feedback_story_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX validate_rule_feedback_story_active_idx ON public.validate_rule_feedback USING btree (story_id, active, created_at DESC);


--
-- Name: validate_rule_feedback_story_chapter_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX validate_rule_feedback_story_chapter_idx ON public.validate_rule_feedback USING btree (story_id, chapter_id) WHERE (chapter_id IS NOT NULL);


--
-- Name: writing_analysis_staging_story_chapter_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX writing_analysis_staging_story_chapter_idx ON public.writing_analysis_staging USING btree (story_id, chapter_id, created_at DESC);


--
-- Name: writing_analysis_staging_story_task_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX writing_analysis_staging_story_task_uniq ON public.writing_analysis_staging USING btree (story_id, task_id) WHERE (task_id IS NOT NULL);


--
-- Name: writing_scope_snapshot_v1_story_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX writing_scope_snapshot_v1_story_scope_idx ON public.writing_scope_snapshot_v1 USING btree (story_id, scope_type, scope_key, created_at DESC);


--
-- Name: writing_scope_snapshot_v1_story_scope_stale_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX writing_scope_snapshot_v1_story_scope_stale_idx ON public.writing_scope_snapshot_v1 USING btree (story_id, scope_type, is_stale, created_at DESC);


--
-- Name: writing_snapshot_v3_ready_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX writing_snapshot_v3_ready_idx ON public.writing_snapshot_v3 USING btree (story_id, chapter_id, ready_for_writing, created_at DESC);


--
-- Name: writing_snapshot_v3_story_chapter_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX writing_snapshot_v3_story_chapter_idx ON public.writing_snapshot_v3 USING btree (story_id, chapter_id, created_at DESC);


--
-- Name: writing_snapshot_v3_story_job_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX writing_snapshot_v3_story_job_idx ON public.writing_snapshot_v3 USING btree (story_id, job_id, created_at DESC);


--
-- Name: author_style_profile trg_author_style_profile_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_author_style_profile_updated_at BEFORE UPDATE ON public.author_style_profile FOR EACH ROW EXECUTE FUNCTION public.author_style_profile_touch_updated_at();


--
-- Name: core_memory_vetting_state trg_core_memory_vetting_state_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_core_memory_vetting_state_updated_at BEFORE UPDATE ON public.core_memory_vetting_state FOR EACH ROW EXECUTE FUNCTION public.core_memory_vetting_state_touch_updated_at();


--
-- Name: ingest_job trg_ingest_job_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_ingest_job_updated_at BEFORE UPDATE ON public.ingest_job FOR EACH ROW EXECUTE FUNCTION public.ingest_job_touch_updated_at();


--
-- Name: ingest_task trg_ingest_task_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_ingest_task_updated_at BEFORE UPDATE ON public.ingest_task FOR EACH ROW EXECUTE FUNCTION public.ingest_task_touch_updated_at();


--
-- Name: memory_enrich_task trg_memory_enrich_task_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_memory_enrich_task_updated_at BEFORE UPDATE ON public.memory_enrich_task FOR EACH ROW EXECUTE FUNCTION public.memory_enrich_task_touch_updated_at();


--
-- Name: muse_rules trg_muse_rules_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_muse_rules_updated_at BEFORE UPDATE ON public.muse_rules FOR EACH ROW EXECUTE FUNCTION public.muse_rules_touch_updated_at();


--
-- Name: narrative_scene_version trg_scene_version_enqueue_memory_v1; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_scene_version_enqueue_memory_v1 AFTER INSERT ON public.narrative_scene_version FOR EACH ROW EXECUTE FUNCTION public.enqueue_memory_enrich_task_v1();


--
-- Name: narrative_scene_version trg_scene_version_tsv; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_scene_version_tsv BEFORE INSERT OR UPDATE OF text_content, summary ON public.narrative_scene_version FOR EACH ROW EXECUTE FUNCTION public.scene_version_tsv_update();


--
-- Name: story_beat trg_story_beat_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_story_beat_updated_at BEFORE UPDATE ON public.story_beat FOR EACH ROW EXECUTE FUNCTION public.story_beat_touch_updated_at();


--
-- Name: story_canon_fact trg_story_canon_fact_tsv; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_story_canon_fact_tsv BEFORE INSERT OR UPDATE OF content ON public.story_canon_fact FOR EACH ROW EXECUTE FUNCTION public.story_canon_fact_tsv_update();


--
-- Name: story_map_state trg_story_map_state_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_story_map_state_updated_at BEFORE UPDATE ON public.story_map_state FOR EACH ROW EXECUTE FUNCTION public.story_map_state_touch_updated_at();


--
-- Name: story_scene_map trg_story_scene_map_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_story_scene_map_updated_at BEFORE UPDATE ON public.story_scene_map FOR EACH ROW EXECUTE FUNCTION public.story_scene_map_touch_updated_at();


--
-- Name: story_style_profile trg_story_style_profile_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_story_style_profile_updated_at BEFORE UPDATE ON public.story_style_profile FOR EACH ROW EXECUTE FUNCTION public.story_style_profile_touch_updated_at();


--
-- Name: story_worldbuilding_note trg_story_worldbuilding_note_tsv; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_story_worldbuilding_note_tsv BEFORE INSERT OR UPDATE OF category, content, tags ON public.story_worldbuilding_note FOR EACH ROW EXECUTE FUNCTION public.story_worldbuilding_note_tsv_update();


--
-- Name: timeline_event trg_timeline_tsv; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_timeline_tsv BEFORE INSERT OR UPDATE OF title, body, tags ON public.timeline_event FOR EACH ROW EXECUTE FUNCTION public.timeline_event_tsv_update();


--
-- Name: agent_context_snapshot agent_context_snapshot_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_context_snapshot
    ADD CONSTRAINT agent_context_snapshot_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.story_series(id) ON DELETE CASCADE;


--
-- Name: agent_equipment_slots agent_equipment_slots_agent_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_equipment_slots
    ADD CONSTRAINT agent_equipment_slots_agent_profile_id_fkey FOREIGN KEY (agent_profile_id) REFERENCES public.agent_profiles(id) ON DELETE CASCADE;


--
-- Name: agent_equipment_slots agent_equipment_slots_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_equipment_slots
    ADD CONSTRAINT agent_equipment_slots_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.story_series(id) ON DELETE CASCADE;


--
-- Name: agent_feedback_loop agent_feedback_loop_run_trace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_feedback_loop
    ADD CONSTRAINT agent_feedback_loop_run_trace_id_fkey FOREIGN KEY (run_trace_id) REFERENCES public.agent_run_trace(id) ON DELETE SET NULL;


--
-- Name: agent_feedback_loop agent_feedback_loop_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_feedback_loop
    ADD CONSTRAINT agent_feedback_loop_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.story_series(id) ON DELETE CASCADE;


--
-- Name: agent_janitor_task agent_janitor_task_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_janitor_task
    ADD CONSTRAINT agent_janitor_task_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.ingest_job(id) ON DELETE CASCADE;


--
-- Name: agent_janitor_task agent_janitor_task_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_janitor_task
    ADD CONSTRAINT agent_janitor_task_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.story_series(id) ON DELETE CASCADE;


--
-- Name: agent_memory_vector agent_memory_vector_source_run_trace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_memory_vector
    ADD CONSTRAINT agent_memory_vector_source_run_trace_id_fkey FOREIGN KEY (source_run_trace_id) REFERENCES public.agent_run_trace(id) ON DELETE SET NULL;


--
-- Name: agent_memory_vector agent_memory_vector_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_memory_vector
    ADD CONSTRAINT agent_memory_vector_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.story_series(id) ON DELETE CASCADE;


--
-- Name: agent_profile_event agent_profile_event_agent_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_profile_event
    ADD CONSTRAINT agent_profile_event_agent_profile_id_fkey FOREIGN KEY (agent_profile_id) REFERENCES public.agent_profiles(id) ON DELETE CASCADE;


--
-- Name: agent_profile_event agent_profile_event_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_profile_event
    ADD CONSTRAINT agent_profile_event_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.story_series(id) ON DELETE SET NULL;


--
-- Name: agent_profiles agent_profiles_base_dna_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_profiles
    ADD CONSTRAINT agent_profiles_base_dna_id_fkey FOREIGN KEY (base_dna_id) REFERENCES public.agent_prompt_version(id) ON DELETE SET NULL;


--
-- Name: agent_prompt_experiment agent_prompt_experiment_baseline_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_prompt_experiment
    ADD CONSTRAINT agent_prompt_experiment_baseline_version_id_fkey FOREIGN KEY (baseline_version_id) REFERENCES public.agent_prompt_version(id) ON DELETE CASCADE;


--
-- Name: agent_prompt_experiment agent_prompt_experiment_candidate_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_prompt_experiment
    ADD CONSTRAINT agent_prompt_experiment_candidate_version_id_fkey FOREIGN KEY (candidate_version_id) REFERENCES public.agent_prompt_version(id) ON DELETE CASCADE;


--
-- Name: agent_prompt_experiment agent_prompt_experiment_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_prompt_experiment
    ADD CONSTRAINT agent_prompt_experiment_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.story_series(id) ON DELETE CASCADE;


--
-- Name: agent_prompt_hydration_trace agent_prompt_hydration_trace_context_snapshot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_prompt_hydration_trace
    ADD CONSTRAINT agent_prompt_hydration_trace_context_snapshot_id_fkey FOREIGN KEY (context_snapshot_id) REFERENCES public.agent_context_snapshot(id) ON DELETE SET NULL;


--
-- Name: agent_prompt_hydration_trace agent_prompt_hydration_trace_prompt_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_prompt_hydration_trace
    ADD CONSTRAINT agent_prompt_hydration_trace_prompt_version_id_fkey FOREIGN KEY (prompt_version_id) REFERENCES public.agent_prompt_version(id) ON DELETE SET NULL;


--
-- Name: agent_prompt_hydration_trace agent_prompt_hydration_trace_run_trace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_prompt_hydration_trace
    ADD CONSTRAINT agent_prompt_hydration_trace_run_trace_id_fkey FOREIGN KEY (run_trace_id) REFERENCES public.agent_run_trace(id) ON DELETE SET NULL;


--
-- Name: agent_prompt_hydration_trace agent_prompt_hydration_trace_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_prompt_hydration_trace
    ADD CONSTRAINT agent_prompt_hydration_trace_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.story_series(id) ON DELETE CASCADE;


--
-- Name: agent_prompt_hydration_trace agent_prompt_hydration_trace_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_prompt_hydration_trace
    ADD CONSTRAINT agent_prompt_hydration_trace_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.ingest_task(id) ON DELETE SET NULL;


--
-- Name: agent_prompt_profile agent_prompt_profile_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_prompt_profile
    ADD CONSTRAINT agent_prompt_profile_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.story_series(id) ON DELETE CASCADE;


--
-- Name: agent_prompt_version agent_prompt_version_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_prompt_version
    ADD CONSTRAINT agent_prompt_version_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.agent_prompt_profile(id) ON DELETE CASCADE;


--
-- Name: agent_run_trace agent_run_trace_agent_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_run_trace
    ADD CONSTRAINT agent_run_trace_agent_profile_id_fkey FOREIGN KEY (agent_profile_id) REFERENCES public.agent_profiles(id) ON DELETE SET NULL;


--
-- Name: agent_run_trace agent_run_trace_context_snapshot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_run_trace
    ADD CONSTRAINT agent_run_trace_context_snapshot_id_fkey FOREIGN KEY (context_snapshot_id) REFERENCES public.agent_context_snapshot(id) ON DELETE SET NULL;


--
-- Name: agent_run_trace agent_run_trace_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_run_trace
    ADD CONSTRAINT agent_run_trace_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.ingest_job(id) ON DELETE SET NULL;


--
-- Name: agent_run_trace agent_run_trace_prompt_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_run_trace
    ADD CONSTRAINT agent_run_trace_prompt_version_id_fkey FOREIGN KEY (prompt_version_id) REFERENCES public.agent_prompt_version(id) ON DELETE SET NULL;


--
-- Name: agent_run_trace agent_run_trace_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_run_trace
    ADD CONSTRAINT agent_run_trace_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.story_series(id) ON DELETE CASCADE;


--
-- Name: agent_run_trace agent_run_trace_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_run_trace
    ADD CONSTRAINT agent_run_trace_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.ingest_task(id) ON DELETE SET NULL;


--
-- Name: agent_tuning_event agent_tuning_event_from_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_tuning_event
    ADD CONSTRAINT agent_tuning_event_from_version_id_fkey FOREIGN KEY (from_version_id) REFERENCES public.agent_prompt_version(id) ON DELETE SET NULL;


--
-- Name: agent_tuning_event agent_tuning_event_to_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_tuning_event
    ADD CONSTRAINT agent_tuning_event_to_version_id_fkey FOREIGN KEY (to_version_id) REFERENCES public.agent_prompt_version(id) ON DELETE CASCADE;


--
-- Name: analysis_delta_report_v1 analysis_delta_report_v1_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.analysis_delta_report_v1
    ADD CONSTRAINT analysis_delta_report_v1_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.story_series(id) ON DELETE CASCADE;


--
-- Name: author_annotation_v1 author_annotation_v1_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.author_annotation_v1
    ADD CONSTRAINT author_annotation_v1_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.story_series(id) ON DELETE CASCADE;


--
-- Name: author_annotation_v1 author_annotation_v1_supersedes_annotation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.author_annotation_v1
    ADD CONSTRAINT author_annotation_v1_supersedes_annotation_id_fkey FOREIGN KEY (supersedes_annotation_id) REFERENCES public.author_annotation_v1(annotation_id) ON DELETE SET NULL;


--
-- Name: author_style_profile author_style_profile_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.author_style_profile
    ADD CONSTRAINT author_style_profile_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.story_series(id) ON DELETE CASCADE;


--
-- Name: autowrite_cutover_state_v1 autowrite_cutover_state_v1_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.autowrite_cutover_state_v1
    ADD CONSTRAINT autowrite_cutover_state_v1_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.story_series(id) ON DELETE CASCADE;


--
-- Name: canon_fact canon_fact_scene_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.canon_fact
    ADD CONSTRAINT canon_fact_scene_id_fkey FOREIGN KEY (scene_id) REFERENCES public.narrative_scene(id) ON DELETE CASCADE;


--
-- Name: canon_fact canon_fact_scene_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.canon_fact
    ADD CONSTRAINT canon_fact_scene_version_id_fkey FOREIGN KEY (scene_version_id) REFERENCES public.narrative_scene_version(id) ON DELETE CASCADE;


--
-- Name: canon_fact canon_fact_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.canon_fact
    ADD CONSTRAINT canon_fact_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.story_series(id) ON DELETE CASCADE;


--
-- Name: chapter_continuity_issue chapter_continuity_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chapter_continuity_issue
    ADD CONSTRAINT chapter_continuity_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.story_series(id) ON DELETE CASCADE;


--
-- Name: chapter_draft chapter_draft_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chapter_draft
    ADD CONSTRAINT chapter_draft_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.story_series(id) ON DELETE CASCADE;


--
-- Name: chapter_ledger chapter_ledger_draft_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chapter_ledger
    ADD CONSTRAINT chapter_ledger_draft_id_fkey FOREIGN KEY (draft_id) REFERENCES public.chapter_draft(id) ON DELETE SET NULL;


--
-- Name: chapter_ledger chapter_ledger_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chapter_ledger
    ADD CONSTRAINT chapter_ledger_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.story_series(id) ON DELETE CASCADE;


--
-- Name: core_memory_vetting_event core_memory_vetting_event_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.core_memory_vetting_event
    ADD CONSTRAINT core_memory_vetting_event_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.story_series(id) ON DELETE CASCADE;


--
-- Name: core_memory_vetting_state core_memory_vetting_state_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.core_memory_vetting_state
    ADD CONSTRAINT core_memory_vetting_state_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.story_series(id) ON DELETE CASCADE;


--
-- Name: entity_conflict_review_event entity_conflict_review_event_review_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_conflict_review_event
    ADD CONSTRAINT entity_conflict_review_event_review_id_fkey FOREIGN KEY (review_id) REFERENCES public.entity_conflict_review(id) ON DELETE CASCADE;


--
-- Name: entity_conflict_review_event entity_conflict_review_event_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_conflict_review_event
    ADD CONSTRAINT entity_conflict_review_event_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.story_series(id) ON DELETE CASCADE;


--
-- Name: entity_conflict_review entity_conflict_review_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_conflict_review
    ADD CONSTRAINT entity_conflict_review_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.story_series(id) ON DELETE CASCADE;


--
-- Name: entity_merge_challenge_v1 entity_merge_challenge_v1_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_merge_challenge_v1
    ADD CONSTRAINT entity_merge_challenge_v1_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.story_series(id) ON DELETE CASCADE;


--
-- Name: entity_resolution_snapshot_v1 entity_resolution_snapshot_v1_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_resolution_snapshot_v1
    ADD CONSTRAINT entity_resolution_snapshot_v1_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.story_series(id) ON DELETE CASCADE;


--
-- Name: entity_truth_overlay entity_truth_overlay_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_truth_overlay
    ADD CONSTRAINT entity_truth_overlay_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.story_series(id) ON DELETE CASCADE;


--
-- Name: ingest_job ingest_job_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ingest_job
    ADD CONSTRAINT ingest_job_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.story_series(id) ON DELETE CASCADE;


--
-- Name: ingest_task ingest_task_depends_on_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ingest_task
    ADD CONSTRAINT ingest_task_depends_on_task_id_fkey FOREIGN KEY (depends_on_task_id) REFERENCES public.ingest_task(id) ON DELETE SET NULL;


--
-- Name: ingest_task ingest_task_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ingest_task
    ADD CONSTRAINT ingest_task_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.ingest_job(id) ON DELETE CASCADE;


--
-- Name: ingest_task ingest_task_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ingest_task
    ADD CONSTRAINT ingest_task_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.story_series(id) ON DELETE CASCADE;


--
-- Name: memory_enrich_task memory_enrich_task_scene_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.memory_enrich_task
    ADD CONSTRAINT memory_enrich_task_scene_id_fkey FOREIGN KEY (scene_id) REFERENCES public.narrative_scene(id) ON DELETE CASCADE;


--
-- Name: memory_enrich_task memory_enrich_task_scene_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.memory_enrich_task
    ADD CONSTRAINT memory_enrich_task_scene_version_id_fkey FOREIGN KEY (scene_version_id) REFERENCES public.narrative_scene_version(id) ON DELETE CASCADE;


--
-- Name: memory_enrich_task memory_enrich_task_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.memory_enrich_task
    ADD CONSTRAINT memory_enrich_task_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.story_series(id) ON DELETE CASCADE;


--
-- Name: muse_analysis muse_analysis_scene_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.muse_analysis
    ADD CONSTRAINT muse_analysis_scene_id_fkey FOREIGN KEY (scene_id) REFERENCES public.narrative_scene(id) ON DELETE SET NULL;


--
-- Name: muse_analysis muse_analysis_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.muse_analysis
    ADD CONSTRAINT muse_analysis_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.story_series(id) ON DELETE CASCADE;


--
-- Name: muse_rules muse_rules_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.muse_rules
    ADD CONSTRAINT muse_rules_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.story_series(id) ON DELETE CASCADE;


--
-- Name: muse_snapshots muse_snapshots_source_snapshot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.muse_snapshots
    ADD CONSTRAINT muse_snapshots_source_snapshot_id_fkey FOREIGN KEY (source_snapshot_id) REFERENCES public.muse_snapshots(id) ON DELETE SET NULL;


--
-- Name: muse_snapshots muse_snapshots_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.muse_snapshots
    ADD CONSTRAINT muse_snapshots_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.story_series(id) ON DELETE CASCADE;


--
-- Name: narrative_pipeline_run narrative_pipeline_run_scene_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.narrative_pipeline_run
    ADD CONSTRAINT narrative_pipeline_run_scene_id_fkey FOREIGN KEY (scene_id) REFERENCES public.narrative_scene(id) ON DELETE SET NULL;


--
-- Name: narrative_pipeline_run narrative_pipeline_run_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.narrative_pipeline_run
    ADD CONSTRAINT narrative_pipeline_run_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.story_series(id) ON DELETE CASCADE;


--
-- Name: narrative_scene_state narrative_scene_state_parent_state_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.narrative_scene_state
    ADD CONSTRAINT narrative_scene_state_parent_state_id_fkey FOREIGN KEY (parent_state_id) REFERENCES public.narrative_scene_state(id);


--
-- Name: narrative_scene_state narrative_scene_state_scene_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.narrative_scene_state
    ADD CONSTRAINT narrative_scene_state_scene_id_fkey FOREIGN KEY (scene_id) REFERENCES public.narrative_scene(id) ON DELETE CASCADE;


--
-- Name: narrative_scene_state narrative_scene_state_scene_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.narrative_scene_state
    ADD CONSTRAINT narrative_scene_state_scene_version_id_fkey FOREIGN KEY (scene_version_id) REFERENCES public.narrative_scene_version(id) ON DELETE CASCADE;


--
-- Name: narrative_scene_state narrative_scene_state_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.narrative_scene_state
    ADD CONSTRAINT narrative_scene_state_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.story_series(id) ON DELETE CASCADE;


--
-- Name: narrative_scene narrative_scene_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.narrative_scene
    ADD CONSTRAINT narrative_scene_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.story_series(id) ON DELETE CASCADE;


--
-- Name: narrative_scene_version narrative_scene_version_scene_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.narrative_scene_version
    ADD CONSTRAINT narrative_scene_version_scene_id_fkey FOREIGN KEY (scene_id) REFERENCES public.narrative_scene(id) ON DELETE CASCADE;


--
-- Name: narrative_scene_version narrative_scene_version_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.narrative_scene_version
    ADD CONSTRAINT narrative_scene_version_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.story_series(id) ON DELETE CASCADE;


--
-- Name: pack_budget_policy_v1 pack_budget_policy_v1_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pack_budget_policy_v1
    ADD CONSTRAINT pack_budget_policy_v1_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.story_series(id) ON DELETE CASCADE;


--
-- Name: pipeline_node_event pipeline_node_event_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pipeline_node_event
    ADD CONSTRAINT pipeline_node_event_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.ingest_job(id) ON DELETE CASCADE;


--
-- Name: pipeline_node_event pipeline_node_event_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pipeline_node_event
    ADD CONSTRAINT pipeline_node_event_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.story_series(id) ON DELETE CASCADE;


--
-- Name: pipeline_node_event pipeline_node_event_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pipeline_node_event
    ADD CONSTRAINT pipeline_node_event_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.ingest_task(id) ON DELETE SET NULL;


--
-- Name: post_chapter_profile_v1 post_chapter_profile_v1_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_chapter_profile_v1
    ADD CONSTRAINT post_chapter_profile_v1_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.ingest_job(id) ON DELETE SET NULL;


--
-- Name: post_chapter_profile_v1 post_chapter_profile_v1_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_chapter_profile_v1
    ADD CONSTRAINT post_chapter_profile_v1_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.story_series(id) ON DELETE CASCADE;


--
-- Name: pre_chapter_profile_v1 pre_chapter_profile_v1_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pre_chapter_profile_v1
    ADD CONSTRAINT pre_chapter_profile_v1_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.ingest_job(id) ON DELETE SET NULL;


--
-- Name: pre_chapter_profile_v1 pre_chapter_profile_v1_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pre_chapter_profile_v1
    ADD CONSTRAINT pre_chapter_profile_v1_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.story_series(id) ON DELETE CASCADE;


--
-- Name: priority_override_rules_v1 priority_override_rules_v1_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.priority_override_rules_v1
    ADD CONSTRAINT priority_override_rules_v1_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.story_series(id) ON DELETE CASCADE;


--
-- Name: review_apply_log review_apply_log_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.review_apply_log
    ADD CONSTRAINT review_apply_log_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.review_request(id) ON DELETE CASCADE;


--
-- Name: review_apply_log review_apply_log_response_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.review_apply_log
    ADD CONSTRAINT review_apply_log_response_id_fkey FOREIGN KEY (response_id) REFERENCES public.review_response(id) ON DELETE SET NULL;


--
-- Name: review_request review_request_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.review_request
    ADD CONSTRAINT review_request_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.ingest_job(id) ON DELETE SET NULL;


--
-- Name: review_request review_request_scene_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.review_request
    ADD CONSTRAINT review_request_scene_version_id_fkey FOREIGN KEY (scene_version_id) REFERENCES public.narrative_scene_version(id) ON DELETE RESTRICT;


--
-- Name: review_request review_request_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.review_request
    ADD CONSTRAINT review_request_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.story_series(id) ON DELETE CASCADE;


--
-- Name: review_response review_response_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.review_response
    ADD CONSTRAINT review_response_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.review_request(id) ON DELETE CASCADE;


--
-- Name: shadow_run_pair shadow_run_pair_active_run_trace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shadow_run_pair
    ADD CONSTRAINT shadow_run_pair_active_run_trace_id_fkey FOREIGN KEY (active_run_trace_id) REFERENCES public.agent_run_trace(id) ON DELETE SET NULL;


--
-- Name: shadow_run_pair shadow_run_pair_context_snapshot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shadow_run_pair
    ADD CONSTRAINT shadow_run_pair_context_snapshot_id_fkey FOREIGN KEY (context_snapshot_id) REFERENCES public.agent_context_snapshot(id) ON DELETE SET NULL;


--
-- Name: shadow_run_pair shadow_run_pair_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shadow_run_pair
    ADD CONSTRAINT shadow_run_pair_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.ingest_job(id) ON DELETE SET NULL;


--
-- Name: shadow_run_pair shadow_run_pair_shadow_run_trace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shadow_run_pair
    ADD CONSTRAINT shadow_run_pair_shadow_run_trace_id_fkey FOREIGN KEY (shadow_run_trace_id) REFERENCES public.agent_run_trace(id) ON DELETE SET NULL;


--
-- Name: shadow_run_pair shadow_run_pair_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shadow_run_pair
    ADD CONSTRAINT shadow_run_pair_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.story_series(id) ON DELETE CASCADE;


--
-- Name: shadow_run_pair shadow_run_pair_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shadow_run_pair
    ADD CONSTRAINT shadow_run_pair_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.ingest_task(id) ON DELETE SET NULL;


--
-- Name: source_doc source_doc_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.source_doc
    ADD CONSTRAINT source_doc_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.story_series(id) ON DELETE CASCADE;


--
-- Name: split_feedback split_feedback_chapter_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.split_feedback
    ADD CONSTRAINT split_feedback_chapter_task_id_fkey FOREIGN KEY (chapter_task_id) REFERENCES public.ingest_task(id) ON DELETE SET NULL;


--
-- Name: split_feedback split_feedback_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.split_feedback
    ADD CONSTRAINT split_feedback_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.ingest_job(id) ON DELETE SET NULL;


--
-- Name: split_feedback split_feedback_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.split_feedback
    ADD CONSTRAINT split_feedback_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.story_series(id) ON DELETE CASCADE;


--
-- Name: split_strategy_profile split_strategy_profile_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.split_strategy_profile
    ADD CONSTRAINT split_strategy_profile_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.story_series(id) ON DELETE CASCADE;


--
-- Name: story_active_analysis_scope_snapshot story_active_analysis_scope_snapshot_snapshot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_active_analysis_scope_snapshot
    ADD CONSTRAINT story_active_analysis_scope_snapshot_snapshot_id_fkey FOREIGN KEY (snapshot_id) REFERENCES public.writing_scope_snapshot_v1(id) ON DELETE CASCADE;


--
-- Name: story_active_analysis_scope_snapshot story_active_analysis_scope_snapshot_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_active_analysis_scope_snapshot
    ADD CONSTRAINT story_active_analysis_scope_snapshot_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.story_series(id) ON DELETE CASCADE;


--
-- Name: story_active_analysis_snapshot story_active_analysis_snapshot_snapshot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_active_analysis_snapshot
    ADD CONSTRAINT story_active_analysis_snapshot_snapshot_id_fkey FOREIGN KEY (snapshot_id) REFERENCES public.writing_snapshot_v3(id) ON DELETE CASCADE;


--
-- Name: story_active_analysis_snapshot story_active_analysis_snapshot_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_active_analysis_snapshot
    ADD CONSTRAINT story_active_analysis_snapshot_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.story_series(id) ON DELETE CASCADE;


--
-- Name: story_arc story_arc_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_arc
    ADD CONSTRAINT story_arc_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.story_series(id) ON DELETE CASCADE;


--
-- Name: story_beat story_beat_arc_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_beat
    ADD CONSTRAINT story_beat_arc_id_fkey FOREIGN KEY (arc_id) REFERENCES public.story_arc(id) ON DELETE SET NULL;


--
-- Name: story_beat story_beat_map_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_beat
    ADD CONSTRAINT story_beat_map_version_id_fkey FOREIGN KEY (map_version_id) REFERENCES public.story_map_version(id) ON DELETE CASCADE;


--
-- Name: story_beat story_beat_scene_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_beat
    ADD CONSTRAINT story_beat_scene_id_fkey FOREIGN KEY (scene_id) REFERENCES public.narrative_scene(id) ON DELETE CASCADE;


--
-- Name: story_canon_fact story_canon_fact_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_canon_fact
    ADD CONSTRAINT story_canon_fact_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.story_series(id) ON DELETE CASCADE;


--
-- Name: story_caution story_caution_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_caution
    ADD CONSTRAINT story_caution_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.story_series(id) ON DELETE CASCADE;


--
-- Name: story_chapter story_chapter_arc_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_chapter
    ADD CONSTRAINT story_chapter_arc_id_fkey FOREIGN KEY (arc_id) REFERENCES public.story_arc(id) ON DELETE SET NULL;


--
-- Name: story_chapter story_chapter_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_chapter
    ADD CONSTRAINT story_chapter_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.story_series(id) ON DELETE CASCADE;


--
-- Name: story_dictionary story_dictionary_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_dictionary
    ADD CONSTRAINT story_dictionary_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.story_series(id) ON DELETE CASCADE;


--
-- Name: story_image story_image_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_image
    ADD CONSTRAINT story_image_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.story_series(id) ON DELETE CASCADE;


--
-- Name: story_map_state story_map_state_active_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_map_state
    ADD CONSTRAINT story_map_state_active_version_id_fkey FOREIGN KEY (active_version_id) REFERENCES public.story_map_version(id) ON DELETE SET NULL;


--
-- Name: story_map_state story_map_state_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_map_state
    ADD CONSTRAINT story_map_state_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.story_series(id) ON DELETE CASCADE;


--
-- Name: story_map_state story_map_state_working_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_map_state
    ADD CONSTRAINT story_map_state_working_version_id_fkey FOREIGN KEY (working_version_id) REFERENCES public.story_map_version(id) ON DELETE SET NULL;


--
-- Name: story_map_version story_map_version_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_map_version
    ADD CONSTRAINT story_map_version_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.story_series(id) ON DELETE CASCADE;


--
-- Name: story_milestone story_milestone_arc_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_milestone
    ADD CONSTRAINT story_milestone_arc_id_fkey FOREIGN KEY (arc_id) REFERENCES public.story_arc(id) ON DELETE SET NULL;


--
-- Name: story_milestone story_milestone_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_milestone
    ADD CONSTRAINT story_milestone_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.story_series(id) ON DELETE CASCADE;


--
-- Name: story_quality_policy story_quality_policy_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_quality_policy
    ADD CONSTRAINT story_quality_policy_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.story_series(id) ON DELETE CASCADE;


--
-- Name: story_scene_map story_scene_map_arc_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_scene_map
    ADD CONSTRAINT story_scene_map_arc_id_fkey FOREIGN KEY (arc_id) REFERENCES public.story_arc(id) ON DELETE SET NULL;


--
-- Name: story_scene_map story_scene_map_map_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_scene_map
    ADD CONSTRAINT story_scene_map_map_version_id_fkey FOREIGN KEY (map_version_id) REFERENCES public.story_map_version(id) ON DELETE CASCADE;


--
-- Name: story_scene_map story_scene_map_scene_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_scene_map
    ADD CONSTRAINT story_scene_map_scene_id_fkey FOREIGN KEY (scene_id) REFERENCES public.narrative_scene(id) ON DELETE CASCADE;


--
-- Name: story_style_profile story_style_profile_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_style_profile
    ADD CONSTRAINT story_style_profile_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.story_series(id) ON DELETE CASCADE;


--
-- Name: story_tag story_tag_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_tag
    ADD CONSTRAINT story_tag_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.story_series(id) ON DELETE CASCADE;


--
-- Name: story_thread story_thread_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_thread
    ADD CONSTRAINT story_thread_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.story_series(id) ON DELETE CASCADE;


--
-- Name: story_worldbuilding_note story_worldbuilding_note_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_worldbuilding_note
    ADD CONSTRAINT story_worldbuilding_note_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.story_series(id) ON DELETE CASCADE;


--
-- Name: style_profile_scene style_profile_scene_scene_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.style_profile_scene
    ADD CONSTRAINT style_profile_scene_scene_id_fkey FOREIGN KEY (scene_id) REFERENCES public.narrative_scene(id) ON DELETE CASCADE;


--
-- Name: style_profile_scene style_profile_scene_scene_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.style_profile_scene
    ADD CONSTRAINT style_profile_scene_scene_version_id_fkey FOREIGN KEY (scene_version_id) REFERENCES public.narrative_scene_version(id) ON DELETE CASCADE;


--
-- Name: style_profile_scene style_profile_scene_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.style_profile_scene
    ADD CONSTRAINT style_profile_scene_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.story_series(id) ON DELETE CASCADE;


--
-- Name: supervisor_memory supervisor_memory_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supervisor_memory
    ADD CONSTRAINT supervisor_memory_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.story_series(id) ON DELETE CASCADE;


--
-- Name: thread_state_v1 thread_state_v1_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.thread_state_v1
    ADD CONSTRAINT thread_state_v1_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.story_series(id) ON DELETE CASCADE;


--
-- Name: timeline_anchor timeline_anchor_scene_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timeline_anchor
    ADD CONSTRAINT timeline_anchor_scene_id_fkey FOREIGN KEY (scene_id) REFERENCES public.narrative_scene(id) ON DELETE CASCADE;


--
-- Name: timeline_anchor timeline_anchor_scene_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timeline_anchor
    ADD CONSTRAINT timeline_anchor_scene_version_id_fkey FOREIGN KEY (scene_version_id) REFERENCES public.narrative_scene_version(id) ON DELETE CASCADE;


--
-- Name: timeline_anchor timeline_anchor_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timeline_anchor
    ADD CONSTRAINT timeline_anchor_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.story_series(id) ON DELETE CASCADE;


--
-- Name: timeline_event timeline_event_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timeline_event
    ADD CONSTRAINT timeline_event_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.story_series(id) ON DELETE CASCADE;


--
-- Name: truth_adjudication_snapshot_v1 truth_adjudication_snapshot_v1_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.truth_adjudication_snapshot_v1
    ADD CONSTRAINT truth_adjudication_snapshot_v1_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.story_series(id) ON DELETE CASCADE;


--
-- Name: truth_adjudication_snapshot_v1 truth_adjudication_snapshot_v_entity_resolution_snapshot_i_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.truth_adjudication_snapshot_v1
    ADD CONSTRAINT truth_adjudication_snapshot_v_entity_resolution_snapshot_i_fkey FOREIGN KEY (entity_resolution_snapshot_id) REFERENCES public.entity_resolution_snapshot_v1(id) ON DELETE SET NULL;


--
-- Name: truth_conflict_registry truth_conflict_registry_context_snapshot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.truth_conflict_registry
    ADD CONSTRAINT truth_conflict_registry_context_snapshot_id_fkey FOREIGN KEY (context_snapshot_id) REFERENCES public.agent_context_snapshot(id) ON DELETE SET NULL;


--
-- Name: truth_conflict_registry truth_conflict_registry_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.truth_conflict_registry
    ADD CONSTRAINT truth_conflict_registry_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.ingest_job(id) ON DELETE SET NULL;


--
-- Name: truth_conflict_registry truth_conflict_registry_run_trace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.truth_conflict_registry
    ADD CONSTRAINT truth_conflict_registry_run_trace_id_fkey FOREIGN KEY (run_trace_id) REFERENCES public.agent_run_trace(id) ON DELETE SET NULL;


--
-- Name: truth_conflict_registry truth_conflict_registry_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.truth_conflict_registry
    ADD CONSTRAINT truth_conflict_registry_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.story_series(id) ON DELETE CASCADE;


--
-- Name: truth_conflict_registry truth_conflict_registry_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.truth_conflict_registry
    ADD CONSTRAINT truth_conflict_registry_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.ingest_task(id) ON DELETE SET NULL;


--
-- Name: validate_rule_feedback validate_rule_feedback_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.validate_rule_feedback
    ADD CONSTRAINT validate_rule_feedback_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.story_series(id) ON DELETE CASCADE;


--
-- Name: writing_analysis_staging writing_analysis_staging_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.writing_analysis_staging
    ADD CONSTRAINT writing_analysis_staging_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.ingest_job(id) ON DELETE SET NULL;


--
-- Name: writing_analysis_staging writing_analysis_staging_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.writing_analysis_staging
    ADD CONSTRAINT writing_analysis_staging_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.story_series(id) ON DELETE CASCADE;


--
-- Name: writing_analysis_staging writing_analysis_staging_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.writing_analysis_staging
    ADD CONSTRAINT writing_analysis_staging_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.ingest_task(id) ON DELETE SET NULL;


--
-- Name: writing_scope_snapshot_v1 writing_scope_snapshot_v1_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.writing_scope_snapshot_v1
    ADD CONSTRAINT writing_scope_snapshot_v1_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.story_series(id) ON DELETE CASCADE;


--
-- Name: writing_snapshot_v3 writing_snapshot_v3_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.writing_snapshot_v3
    ADD CONSTRAINT writing_snapshot_v3_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.ingest_job(id) ON DELETE SET NULL;


--
-- Name: writing_snapshot_v3 writing_snapshot_v3_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.writing_snapshot_v3
    ADD CONSTRAINT writing_snapshot_v3_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.story_series(id) ON DELETE CASCADE;


--
-- Name: writing_snapshot_v3 writing_snapshot_v3_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.writing_snapshot_v3
    ADD CONSTRAINT writing_snapshot_v3_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.ingest_task(id) ON DELETE SET NULL;


--
-- PostgreSQL database dump complete
--

\unrestrict B1aiIVXi3u2tPO2RGaa3sCuA1UJaYnbNpknIoOZdvpaYaOll4b5fezR0Gvl2fCa
