# Research Bibliography: Narrative Style and Continuity

Purpose: keep a compact, repo-local research map for long-fiction style
preservation, continuity extraction, timeline consistency, and source-grounded
chapter generation.

## Design Findings

1. Ingested chapters are enough for retrieval only if extraction preserves
   source trace, chronology, entity state, and confidence. Plain embeddings over
   chunks are not enough for temporal or causal questions.
2. Author style should be handled as a separate profile from story truth. Style
   features include syntax, lexical habits, sentence rhythm, discourse shape,
   imagery density, and dialogue texture.
3. Long story generation benefits from planning before prose. Detailed outline
   control, dynamic plot state, and explicit storyworld state outperform direct
   generation in coherence-oriented evaluations.
4. Long-range consistency failures are predictable enough to test: factual,
   temporal, character, and world-rule contradictions need explicit checks and
   evidence-grounded judgments.
5. RAG helps only when retrieval quality, grounding fidelity, context filtering,
   and coordination are controlled. For fiction, order-preserving and
   entity/event-aware retrieval matter more than generic semantic similarity.

## Papers

### Long-Range Plot and Outline Control

- Yang, Klein, Peng, and Tian. 2023. "DOC: Improving Long Story Coherence With
  Detailed Outline Control." ACL 2023.
  Source: https://aclanthology.org/2023.acl-long.190/
  Notes: DOC uses a detailed outliner and controller for several-thousand-word
  stories. Human evaluation reported gains in plot coherence, outline relevance,
  interestingness, and controllability. Design implication: Novel Lab should
  make chapter planning and outline adherence first-class before drafting.

- Rashkin, Celikyilmaz, Choi, and Gao. 2020. "PlotMachines:
  Outline-Conditioned Generation with Dynamic Plot State Tracking." EMNLP 2020.
  Source: https://aclanthology.org/2020.emnlp-main.349/
  Notes: The paper argues that large language models alone are not sufficient
  for coherent outline-conditioned narratives and that dynamic plot state
  tracking matters. Design implication: keep a chapter/state handoff instead of
  relying on the model to remember prior events.

- Zhu et al. 2023. "End-to-end Story Plot Generator." arXiv:2310.08796.
  Source: https://arxiv.org/abs/2310.08796
  Notes: Story plots carry essential information from full stories and planning
  pipelines can be expensive. Design implication: cache reusable plot, premise,
  character, and outline artifacts instead of regenerating them every time.

### Knowledge Graphs, Reader Models, and Storyworld State

- Peng et al. 2022. "Guiding Neural Story Generation with Reader Models."
  Findings of EMNLP 2022.
  Source: https://aclanthology.org/2022.findings-emnlp.526/
  Notes: StoRM uses a reader model over storyworld concepts, entities, and
  relations represented as a knowledge graph, improving coherence and
  controllability toward a target storyworld state. Design implication:
  continuity checks should ask what a reader believes is true after each chapter.

- Li et al. 2025. "STORYTELLER: An Enhanced Plot-Planning Framework for
  Coherent and Cohesive Story Generation." Findings of ACL 2025.
  Source: https://aclanthology.org/2025.findings-acl.1071/
  Notes: Introduces SVO plot nodes plus a narrative entity knowledge graph that
  interact with generation. Design implication: extract event triples and entity
  state deltas, not only summaries.

- Zhang et al. 2026. "Respecting Temporal-Causal Consistency: Entity-Event
  Knowledge Graph for Retrieval-Augmented Generation." EACL 2026.
  Source: https://aclanthology.org/2026.eacl-long.90/
  Notes: Standard unstructured RAG lacks chronological structure, and collapsed
  entity nodes erase evolving narrative context. The paper proposes separate
  entity and event graphs linked by a bipartite mapping. Design implication:
  Novel Lab should preserve event order and character state at event time.

### Long-Form Consistency Evaluation

- Li et al. 2026. "Lost in Stories: Consistency Bugs in Long Story Generation by
  LLMs." arXiv:2603.05890.
  Source: https://arxiv.org/abs/2603.05890
  Notes: Defines consistency bug categories and finds factual and temporal
  errors are common in long narratives. Design implication: validation should
  classify factual, temporal, character, and world-rule contradictions and cite
  evidence.

- Ma, Susilo, Haslum, and Suominen. 2026. "Text-to-Text Automatic Story
  Generation: A Survey." EACL SRW 2026.
  Source: https://aclanthology.org/2026.eacl-srw.39/
  Notes: The survey identifies narrative coherence, character consistency,
  storyline diversity, plot controllability, and evaluation metrics as persistent
  challenges. Design implication: product claims should be measured through
  explicit acceptance gates rather than generic output fluency.

- Park, Yang, and Jung. 2023/2025. "LongStory: Coherent, Complete and Length
  Controlled Long story Generation." arXiv:2311.15208.
  Source: https://arxiv.org/abs/2311.15208
  Notes: Separates long-term and short-term context roles and adds structural
  position signals. Design implication: chapter generation should combine
  global memory, immediate handoff, and structural position instead of one flat
  context blob.

### Author Style and Low-Resource Style Transfer

- Wegmann, Schraagen, and Nguyen. 2018. "What represents style in authorship
  attribution?" COLING 2018.
  Source: https://aclanthology.org/C18-1238/
  Notes: Studies syntax and lexical classes for style representation and shows
  topic/content can interfere with attribution. Design implication: style
  extraction should separate content-bearing proper nouns from reusable
  stylistic signals.

- Patel, Andrews, and Callison-Burch. 2022/2024. "Low-Resource Authorship Style
  Transfer: Can Non-Famous Authors Be Imitated?" arXiv:2212.08986.
  Source: https://arxiv.org/abs/2212.08986
  Notes: Low-resource authorship style transfer remains difficult; in-context
  learning is a strong baseline, but current approaches do not master the task.
  Design implication: with about 18k polished words from chapters 1-10, Novel
  Lab can build a useful style guide but should not claim guaranteed imitation.

### Retrieval-Augmented Generation

- Sharma. 2025. "Retrieval-Augmented Generation: A Comprehensive Survey of
  Architectures, Enhancements, and Robustness Frontiers." arXiv:2506.00054.
  Source: https://arxiv.org/abs/2506.00054
  Notes: RAG addresses factual inconsistency and domain inflexibility but adds
  challenges in retrieval quality, grounding fidelity, robustness, context
  filtering, and coordination. Design implication: source retrieval must be
  evaluated, not assumed correct.

## Practical Translation for Novel Lab

- `style_gold`: curated polished passages. Default for The Subcurrent is
  chapters 1-10 unless the user marks other chapters as polished.
- `continuity_source`: all approved source chapters, including weaker prose,
  because events and timeline may still be canon.
- `immediate_handoff`: last 1-2 chapters plus current chapter target.
- `chronological ledger`: event records ordered by story time and source order.
- `state ledger`: character, relationship, world, object, location, and mystery
  states with currentness and conflict flags.
- `style profile`: sentence length distribution, paragraph length distribution,
  point-of-view habits, dialogue ratio, imagery density, abstraction level,
  rhetorical moves, repeated motifs, and prohibited drift.
- `validation`: compare generated draft against both the style profile and the
  continuity ledger, then require human approval before canon promotion.
