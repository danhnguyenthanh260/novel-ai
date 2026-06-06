# Agent Operating Layer Architecture

Status: Active architecture note
Last updated: 2026-05-28

`.agents/` is the single agent operating layer for this repository.

| Path | Purpose |
|---|---|
| `.agents/README.md` | Canonical harness overview, source-of-truth map, routing contract, stop rules, and verification contract. |
| `.agents/workflows/prompt-universe.md` | Intake router for vague, raw, or multi-intent prompts. |
| `.agents/skills/<skill>/SKILL.md` | Runtime skills loaded for specific work surfaces. |
| `.agents/maintenance.md` | Human-approved skill and harness maintenance workflow. |
| `.agents/reports/` | Historical inventories, skill update reports, and harness analysis outputs. |
| `.agents/agents/` | Optional agent profiles from the local harness library. |
| `.agents/rules/` | Optional model-specific or tool-specific rule files. |
| `.agents/scripts/` | Optional agent helper scripts. |

`AGENTS.md` stays at the repository root as the required agent entrypoint. It
points to this layer but does not duplicate the harness.

Product architecture, runbooks, and system contracts remain under `docs/`.
Runtime product code, migrations, tests, and app docs remain in their existing
repo locations.
