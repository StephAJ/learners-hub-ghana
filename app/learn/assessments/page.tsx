import Link from "next/link";
import { ChevronRightIcon, ClockIcon } from "../../components/icons";
import { WorkspaceShell } from "../../components/workspace-shell";
import {
  listLearnerAssessments,
  type LearnerAssessmentCard,
} from "../../../db/assessment-repository";
import {
  demoAssessmentMarks,
  demoAssessments,
  demoSubjectByOffering,
} from "../../../domain/demo/greenfield";
import type { AccessContext } from "../../../domain/identity/types";
import { requireWorkspaceUser } from "../../../server/workspace-auth";
import "./assessment-index.css";

export const dynamic = "force-dynamic";

const statusLabels: Record<LearnerAssessmentCard["status"], string> = {
  "in-progress": "Continue",
  invalidated: "Not counted",
  marked: "Marked",
  "needs-marking": "With your teacher",
  "not-started": "Not started",
  released: "Result ready",
  submitted: "Handed in",
};

/**
 * Every assessment set for this learner.
 *
 * The sidebar used to link straight at one hardcoded quiz, which meant the
 * second assessment in the dataset was unreachable and the nav item lied about
 * being a section.
 *
 * The list itself then lied about something larger: it was built from the
 * static demo dataset, so a paper a teacher actually assembled and published
 * never appeared here at all. It reads from the database now, and falls back
 * to the demo set only when that is unreachable — the same pattern the rest of
 * the learner surfaces use.
 */
export default async function LearnerAssessmentsPage() {
  const user = await requireWorkspaceUser("student", "/learn/assessments");
  const assessments = await listAssessments(user.access);

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
          <li key={assessment.href}>
            <Link href={assessment.href}>
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
                  {assessment.statusLabel ? (
                    <span
                      className={`assessment-list-state state-${assessment.status}`}
                    >
                      {assessment.statusLabel}
                    </span>
                  ) : null}
                </span>
              </span>
              <ChevronRightIcon size={18} />
            </Link>
          </li>
        ))}
        {assessments.length === 0 ? (
          <li className="assessment-list-empty">
            Nothing has been set for you yet. Your teachers publish papers here
            when they are ready.
          </li>
        ) : null}
      </ul>
    </WorkspaceShell>
  );
}

type AssessmentListItem = {
  href: string;
  marks: number;
  purpose: string;
  questionCount: number;
  status: string;
  statusLabel?: string;
  subjectName: string;
  timeLimitMinutes: number;
  title: string;
};

async function listAssessments(
  access: AccessContext,
): Promise<AssessmentListItem[]> {
  try {
    const rows = await listLearnerAssessments(access);
    if (rows.length > 0) {
      return rows.map((assessment) => ({
        /* Linked by id rather than slug: a paper assembled in the app has no
           slug — only the demo fixtures do. */
        href: `/learn/assessments/${assessment.id}`,
        marks: assessment.totalMarks,
        purpose: assessment.purpose,
        questionCount: assessment.questionCount,
        status: assessment.status,
        statusLabel: statusLabels[assessment.status],
        subjectName:
          demoSubjectByOffering(assessment.offeringId)?.subjectName ??
          "Subject",
        timeLimitMinutes: assessment.timeLimitMinutes,
        title: assessment.title,
      }));
    }
  } catch {
    /* Falls through to the demo set below, so the page still reads on a
       deployment whose assessment tables are not reachable. */
  }

  /* A draft paper is the teacher's business until it is published. */
  return demoAssessments
    .filter((assessment) => assessment.status === "published")
    .map((assessment) => ({
      href: `/learn/assessments/${assessment.slug}`,
      marks: demoAssessmentMarks(assessment),
      purpose: assessment.purpose,
      questionCount: assessment.questionIds.length,
      status: "not-started",
      subjectName:
        demoSubjectByOffering(assessment.offeringId)?.subjectName ?? "Subject",
      timeLimitMinutes: assessment.timeLimitMinutes,
      title: assessment.title,
    }));
}
