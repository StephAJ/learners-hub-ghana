import { notFound } from "next/navigation";
import { WorkspaceShell } from "../../../components/workspace-shell";
import {
  getLearnerAssessment,
  type LearnerAssessment,
} from "../../../../db/assessment-repository";
import { requireWorkspaceUser } from "../../../../server/workspace-auth";
import { AssessmentRunner } from "./assessment-runner";
/* The lesson player's stylesheet as well as this one. The runner reuses its
   shell classes outright — .lesson-shell, .lesson-toprail, .course-player,
   .course-outline — so that the two screens cannot drift apart, which a second
   copy of the same rules would guarantee they eventually did. */
import "../../subjects/[subject]/lesson-player.css";
import "./quiz-runner.css";

export const dynamic = "force-dynamic";

/**
 * A timed assessment, on the lesson player's shell.
 *
 * The workspace sidebar is still here — a learner meeting a different
 * navigation on every screen was the reason this page stopped taking over the
 * window in the first place — but the assessment now owns the space inside it
 * the way a lesson does: its own sticky rail, the questions listed down the
 * side, and the paper given the full width of the stage.
 *
 * `hideTopbar` and the flush content class are what the lesson player uses,
 * for the same reason: the paper being sat is more useful in the rail than the
 * subject line every other page leads with.
 */
export default async function AssessmentPage({
  params,
}: {
  params: Promise<{ assessment: string }>;
}) {
  const { assessment: key } = await params;
  const user = await requireWorkspaceUser(
    "student",
    `/learn/assessments/${key}`,
  );

  /* The id of a paper a teacher assembled. The demo fixtures used to be tried
     first and rendered as a sittable assessment, which is what let the runner
     fabricate an attempt against a paper that exists in no database — the
     school's published assessments are seeded as real rows, so the fixture
     path was a second, fictional copy of them. */
  const assessment = await loadAssessment(user, key);
  if (!assessment) notFound();
  return (
    <WorkspaceShell
      activeHref="/learn/assessments"
      contentClassName="workspace-content-flush"
      eyebrow="Assessment"
      hideTopbar
      title={assessment.title}
      user={user}
      workspace="student"
    >
      <AssessmentRunner assessment={assessment} />
    </WorkspaceShell>
  );
}

/** The paper as the learner may see it, or undefined if it is not theirs to sit. */
async function loadAssessment(
  user: Awaited<ReturnType<typeof requireWorkspaceUser>>,
  assessmentId: string,
): Promise<LearnerAssessment | undefined> {
  try {
    return await getLearnerAssessment(user.access, assessmentId);
  } catch {
    /* Unpublished, not this school's, or the tables are unreachable. All three
       are a 404 to the learner rather than an error page. */
    return undefined;
  }
}
