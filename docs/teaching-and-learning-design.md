# Teaching and Learning Vertical Slice

Status: Accepted through the approved roadmap and repeated “proceed” instruction  
Date: 23 July 2026

## Understanding summary

- Teachers create lessons inside subject offerings assigned to them.
- A subject contains curriculum units; a unit contains ordered lessons; a
  lesson contains reusable structured blocks.
- Draft work is private to authorised staff until it passes publication rules.
- Learners see published lesson versions through their class-derived subject
  entitlement.
- Lesson delivery must support readable content, media placeholders,
  knowledge checks, resources, and H5P-compatible interactive boundaries.
- Learner progress is stored independently from lesson content and never
  rewrites the published lesson version.
- This slice does not attempt the full assessment/question-bank subsystem.

## Assumptions and non-functional requirements

- Most lesson sessions occur on entry-level Android devices and variable
  connectivity, so the player is compact and text-first.
- Lesson blocks are ordered, version-aware, and suitable for API delivery.
- Publishing is attributed and audited.
- Teachers may only publish within assigned offerings; academic and school
  administrators may publish tenant-wide.
- Learner progress is monotonic for a lesson version and server-validated.
- H5P is represented as an isolated interactive block contract; full external
  H5P hosting and result exchange remain a later integration.
- Video and document uploads remain deferred, so R2 stays unconfigured.

## Approaches considered

1. **Recommended: structured block lesson model.** Predictable rendering,
   accessible fallbacks, mobile contracts, reusable block tooling, and a clean
   H5P boundary.
2. **Rich HTML document storage.** Faster for a basic editor, but difficult to
   validate, version, render natively, and make reliably accessible.
3. **H5P-only lessons.** Highly interactive, but unsuitable as the only content
   model and too tightly coupled to an external runtime.

## Selected design

Lessons move from draft to published through pure domain rules. Publication
requires a meaningful title, at least one objective, at least one content block,
all blocks ready, an active school membership, matching tenant, and subject
assignment or tenant-wide academic authority.

D1 stores subjects, offerings, units, lessons, lesson blocks, and learner
progress. Protected teacher APIs list and create drafts and publish valid
lessons. A learner-facing subject route renders the same block contract with an
interactive knowledge check and progress controls.

## Decision log

| Decision | Alternatives | Reason |
|---|---|---|
| Store typed lesson blocks | Store arbitrary HTML | Enables validation, accessibility, and native mobile rendering |
| Version at publication | Mutate published lessons | Preserves the learner’s delivered content history |
| Keep progress separate | Store progress on lessons | Progress belongs to a learner and lesson version |
| Authorise by subject offering | Broad teacher role | Teachers must not edit unrelated subjects |
| Use an isolated interactive block | Couple lessons directly to H5P | Keeps internal records stable while supporting H5P later |
| Defer file uploads | Add R2 now | No real media upload workflow exists in this slice |

