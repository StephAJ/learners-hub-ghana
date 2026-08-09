import { notFound } from "next/navigation";
import { WorkspaceShell } from "../../../components/workspace-shell";
import {
  getLearnerAssessment,
  type LearnerAssessment,
} from "../../../../db/assessment-repository";
import { requireWorkspaceUser } from "../../../../server/workspace-auth";
import { AssessmentRunner } from "./assessment-runner";
import "./quiz-runner.css";

export const dynamic = "force-dynamic";

/**
 * A timed assessment, inside the workspace shell.
 *
 * There is a real argument for a distraction-free exam screen, and this page
 * used to make it by taking over the window. But it was the same argument the
 * school-day page was making with a different answer, and between them a
 * learner met three different navigations in one session. The sidebar collapses
 * if focus is wanted; it does not disappear on its own.
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
      eyebrow="Assessment"
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
