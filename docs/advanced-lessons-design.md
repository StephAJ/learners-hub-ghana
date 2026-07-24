# Advanced Lesson Authoring and Learning Pathways

Status: Accepted through the approved product roadmap, the earlier scope
confirmation, and the repeated instruction to proceed  
Date: 24 July 2026

## Understanding summary

- Extend the deployed lesson foundation rather than replace its structured
  block and immutable publication model.
- Let teachers compose several ordered activities in one lesson draft.
- Map lessons to Ghanaian curriculum standards so coverage is measurable.
- Let teachers duplicate an existing lesson into a reusable private draft.
- Support immediate, scheduled, and prerequisite-based learner release.
- Present published lessons as an ordered subject pathway with clear locked,
  available, in-progress, and completed states.
- Preserve a compact, responsive, low-bandwidth experience suitable for a
  later native mobile client.

## Assumptions and non-functional requirements

- Existing tenant, assignment, learner-entitlement, audit, lesson-version, and
  progress rules remain authoritative.
- Release decisions are evaluated on the server using the current published
  lesson version and the learner's durable completion records.
- Learners cannot bypass prerequisite or time-window rules by changing client
  state.
- Curriculum mappings belong to the durable lesson identity and survive future
  published versions until an authorised teacher changes them.
- The first standards catalogue is a realistic Integrated Science vertical
  slice; full NaCCA curriculum import remains a later administration workflow.
- Lesson duplication creates a version-zero draft and never copies learner
  progress.
- The system targets common class sizes of 20–60 learners and school-scale
  lesson libraries; indexed D1 lookups are sufficient for this modular
  monolith.
- R2 remains unconfigured because this release does not yet store uploaded
  video, audio, documents, or H5P packages.

## Approaches considered

1. **Recommended: extend the existing structured lesson domain.** Add small,
   relational contracts for standards and release rules while keeping lesson
   versions and progress unchanged.
2. **Embed planning metadata inside lesson JSON.** Quicker initially, but hard
   to query for curriculum coverage, prerequisites, and reporting.
3. **Adopt an external LMS/H5P runtime as the lesson source of truth.** Broad
   content support, but it weakens class-derived access and couples core school
   records to a vendor-specific lifecycle.

## Selected design

Teachers build drafts from ordered typed blocks and map one or more curriculum
standards. A release rule may open immediately, open on a date, and/or require
completion of an earlier published lesson. Publication retains the current
immutable-version behavior. Duplicating a lesson copies its objectives, blocks,
and standards into a new private draft with a fresh identity.

The learner subject API returns only published lessons but includes a
server-evaluated availability state. The player disables locked or scheduled
lessons, names the requirement, continues the learner's saved position, and
unlocks the next lesson after the prerequisite completion is persisted.

## Decision log

| Decision | Alternatives | Reason |
|---|---|---|
| Store curriculum standards relationally | Store tags in lesson JSON | Enables coverage queries, validation, and future imports |
| Store release rules by lesson identity | Copy rules into every version | Scheduling governs access to the logical lesson |
| Evaluate availability server-side | Trust client state | Prevents bypassing dates and prerequisites |
| Duplicate into version-zero draft | Reuse the same lesson identity | Keeps editing and learner history isolated |
| Accept ordered block arrays on draft creation | Create one block at a time only | Delivers a useful authoring flow without a heavyweight editor |
| Keep H5P as a block boundary | Host packages in this release | R2 and an H5P runtime require a separate secure-media design |

