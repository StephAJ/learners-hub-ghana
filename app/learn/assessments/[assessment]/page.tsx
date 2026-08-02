import { notFound } from "next/navigation";
import { WorkspaceShell } from "../../../components/workspace-shell";
import { demoLearnerAssessmentBySlug } from "../../../demo-data";
import {
  demoAssessmentBySlug,
  demoAssessmentMarks,
} from "../../../../domain/demo/greenfield";
import { demoSubjectByOffering } from "../../../../domain/demo/greenfield";
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
  const { assessment: slug } = await params;
  const assessment = demoLearnerAssessmentBySlug(slug);
  const source = demoAssessmentBySlug(slug);
  if (!assessment || !source) notFound();

  const user = await requireWorkspaceUser(
    "student",
    `/learn/assessments/${slug}`,
  );
  const subject = demoSubjectByOffering(source.offeringId);
  const totalMarks = demoAssessmentMarks(source);

  return (
    <WorkspaceShell
      activeHref="/learn/assessments"
      description={`${subject?.subjectName ?? "Assessment"} · ${source.questionIds.length} questions · ${totalMarks} marks · ${source.timeLimitMinutes} minutes`}
      eyebrow="Assessment"
      title={assessment.title}
      user={user}
      workspace="student"
    >
      <AssessmentRunner previewAssessment={assessment} />
    </WorkspaceShell>
  );
}
