import Link from "next/link";
import { ChevronRightIcon, ClockIcon } from "../../components/icons";
import { WorkspaceShell } from "../../components/workspace-shell";
import {
  demoAssessmentMarks,
  demoAssessments,
  demoSubjectByOffering,
} from "../../../domain/demo/greenfield";
import { requireWorkspaceUser } from "../../../server/workspace-auth";
import "./assessment-index.css";

export const dynamic = "force-dynamic";

/**
 * Every assessment set for this learner.
 *
 * The sidebar used to link straight at one hardcoded quiz, which meant the
 * second assessment in the dataset was unreachable and the nav item lied about
 * being a section.
 */
export default async function LearnerAssessmentsPage() {
  const user = await requireWorkspaceUser("student", "/learn/assessments");

  /* A draft paper is the teacher's business until it is published. */
  const assessments = demoAssessments
    .filter((assessment) => assessment.status === "published")
    .map((assessment) => ({
    marks: demoAssessmentMarks(assessment),
    purpose: assessment.purpose,
    questionCount: assessment.questionIds.length,
    slug: assessment.slug,
    subjectName:
      demoSubjectByOffering(assessment.offeringId)?.subjectName ?? "Subject",
    timeLimitMinutes: assessment.timeLimitMinutes,
    title: assessment.title,
  }));

  return (
    <WorkspaceShell
      activeHref="/learn/assessments"
      eyebrow="Learning"
      title="Assessments"
      user={user}
      workspace="student"
    >
      <ul className="assessment-list">
        {assessments.map((assessment) => (
          <li key={assessment.slug}>
            <Link href={`/learn/assessments/${assessment.slug}`}>
              <span className="assessment-list-copy">
                <span className="assessment-list-meta">
                  {assessment.subjectName} · {assessment.purpose}
                </span>
                <strong>{assessment.title}</strong>
                <span className="assessment-list-facts">
                  <span>
                    <ClockIcon size={14} />
                    {assessment.timeLimitMinutes} min
                  </span>
                  <span>{assessment.questionCount} questions</span>
                  <span>{assessment.marks} marks</span>
                </span>
              </span>
              <ChevronRightIcon size={18} />
            </Link>
          </li>
        ))}
      </ul>
    </WorkspaceShell>
  );
}
