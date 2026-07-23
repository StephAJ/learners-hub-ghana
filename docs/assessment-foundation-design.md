# Assessment Foundation Design

Status: Approved implementation direction  
Date: 23 July 2026

## Understanding summary

- Assessment is a first-class school subsystem, not a lesson-only widget.
- Teachers work within assigned subject offerings and reuse versioned questions.
- Published quiz and question versions are immutable so completed attempts remain
  explainable.
- Learners need a low-bandwidth, mobile-ready runner with autosave, flagging,
  timing, and submit confirmation.
- Objective responses are automatically marked; constructed responses enter a
  teacher queue without overwriting the automatic score.
- Feedback and results are released deliberately rather than exposed by default.
- Every record is tenant-scoped and every material mutation is auditable.

## Assumptions

- This release targets one school and the existing Integrated Science offering,
  while all records retain tenant and offering boundaries.
- D1 is the durable prototype store; the contracts remain suitable for a later
  PostgreSQL service and Expo client.
- Server time is authoritative. Offline high-stakes examinations are not part of
  this release.
- File-upload questions are represented in the question taxonomy, but binary
  submissions wait for R2 and upload security infrastructure.
- Question randomisation is recorded as an attempt snapshot; the initial seeded
  quiz uses a fixed teacher-authored order.
- The deployed site remains owner-only while personal-data controls mature.

## Approaches considered

### Selected: versioned assessment kernel

Question-bank items, question versions, quiz versions, attempt snapshots, and
responses are separate records. This adds schema now, but preserves auditability,
supports reuse, and gives web and mobile the same stable contract.

### Rejected: lesson-block quizzes

This is faster but cannot support reusable banks, examination settings,
moderation, durable attempt history, or controlled result release.

### Deferred: external assessment engine

A standards-based external engine could accelerate niche item types, but it
would complicate tenant permissions and school records before the core product
contract is stable.

## Lifecycle

1. A teacher creates or selects approved question versions.
2. A draft quiz pins exact question versions and mark allocations.
3. Publishing produces an immutable quiz version.
4. Starting an attempt records the server start and exact question order.
5. Responses autosave independently and may be flagged for review.
6. Submission auto-marks supported items and identifies manual-marking work.
7. A teacher awards constructed-response marks and records feedback.
8. Releasing the result makes the score and permitted feedback visible.

## Question taxonomy

The domain contract recognises:

- Objective: single choice, multiple choice, true/false, short text, and numeric.
- Structured: matching and ordering.
- Constructed: essay and file upload.
- Visual: hotspot.
- Composite: a stimulus or case study with linked sub-questions.

This release fully runs single choice, multiple choice, true/false, short text,
numeric, matching, ordering, and essay responses. File upload, hotspot authoring,
and composite builders retain first-class type identities for the later rich
authoring milestone.

## Integrity and security

- Teacher mutations require an active assignment or academic-administrator role.
- Learner requests never receive answer keys.
- A response belongs to exactly one tenant, learner, attempt, and pinned question.
- Submitted attempts cannot accept new responses.
- Scores are bounded by question marks and manual awards are separately stored.
- Published versions are never edited in place.
- Audit events cover question creation, publication, attempt submission, marking,
  and release.

## Decision log

| Decision | Alternatives | Reason |
|---|---|---|
| Separate question and quiz versions | Mutable rows | Durable, explainable attempts |
| Snapshot questions into attempts | Read live bank data | Prevent silent attempt changes |
| Store responses as JSON | Table per question type | One stable API across web/mobile |
| Split auto and manual marks | One editable score | Clear ownership and audit |
| Delay binary uploads | Put files in D1 | R2 and malware controls are required |
| Use D1 now | Immediate platform split | Matches the deployed prototype |

