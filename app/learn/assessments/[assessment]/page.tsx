import { notFound } from "next/navigation";
import { WorkspaceShell } from "../../../components/workspace-shell";
import { demoLearnerAssessmentBySlug } from "../../../demo-data";
import {
  getLearnerAssessment,
  type LearnerAssessment,
} from "../../../../db/assessment-repository";
import { demoAssessmentBySlug } from "../../../../domain/demo/greenfield";
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

  /* The segment is either a demo fixture's slug or the id of a paper a teacher
     assembled in the app. Fixtures are tried first so the walkthrough links
     keep working; anything else is looked up in the database. Before this, a
     real assessment id fell straight through to notFound(), which is why a
     published quiz could not be opened even once the index linked to it. */
  const preview =
    demoLearnerAssessmentBySlug(key) ??
    (demoAssessmentBySlug(key) ? undefined : await loadAssessment(user, key));
  if (!preview) notFound();

  const assessment = preview;
  return (
    <WorkspaceShell
      activeHref="/learn/assessments"
      eyebrow="Assessment"
      title={assessment.title}
      user={user}
      workspace="student"
    >
      <AssessmentRunner previewAssessment={assessment} />
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
