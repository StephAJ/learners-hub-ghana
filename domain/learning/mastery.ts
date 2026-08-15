/* ==========================================================================
   When a learner can be said to be able to do something

   This is a judgement, not a calculation, so it lives here where it can be
   argued with and tested rather than inside a SQL query.

   Four states, and the distinction between the first two is the point:

     not-started  nothing has happened against this outcome
     taught       lessons covering it have been completed, and nothing has
                  tested it — so the honest report is "you have met this",
                  not "you can do this"
     learning     it has been tested and the evidence is not yet convincing
     secure       tested enough times, and right nearly every time

   The rule most products use — "80% of the marks" — is what this deliberately
   avoids. A learner who half-answers five questions scores the same as one who
   answers four perfectly and misses the fifth, and only the second has shown
   they can do it. So `correct` here means full marks on a question, and the
   threshold is about how many whole questions went right.
   ========================================================================== */

export type MasteryState = "not-started" | "taught" | "learning" | "secure";

/**
 * How many separate questions have to go right before an outcome is called
 * secure.
 *
 * Two, not one. A single correct answer on a four-option question is right
 * one time in four by guessing alone, and telling a learner they have
 * mastered something on that evidence is worse than telling them nothing.
 */
export const SECURE_MINIMUM_ATTEMPTS = 2;

/** And the share of them, so one slip late on does not undo a settled skill. */
export const SECURE_THRESHOLD = 0.8;

export function masteryState(evidence: {
  attempted: number;
  correct: number;
  lessonsDone: number;
}): MasteryState {
  if (evidence.attempted === 0) {
    return evidence.lessonsDone > 0 ? "taught" : "not-started";
  }
  if (
    evidence.attempted >= SECURE_MINIMUM_ATTEMPTS &&
    evidence.correct / evidence.attempted >= SECURE_THRESHOLD
  ) {
    return "secure";
  }
  return "learning";
}

/** What to say about a state, in the second person, to a learner. */
export function masteryWording(state: MasteryState): string {
  if (state === "secure") return "You can do this";
  if (state === "learning") return "Still working on this";
  if (state === "taught") return "Covered in class, not tested yet";
  return "Not started";
}
