import { WorkspaceShell } from "../../../components/workspace-shell";
import { getLearnerSubject } from "../../../../db/learning-repository";
import {
  loadTeachingOfferings,
  selectOffering,
} from "../../../../db/teaching-offerings";
import { getSchoolDatabase } from "../../../../db";
import { requireWorkspaceUser } from "../../../../server/workspace-auth";
import { LessonPlayer } from "../../../learn/subjects/[subject]/lesson-player";
import "../../../learn/subjects/[subject]/lesson-player.css";

export const dynamic = "force-dynamic";

/**
 * A teacher's preview of their own subject, in the learner's player.
 *
 * "Preview lesson" used to set a notice reading "Learner preview will open in
 * a clearly labelled preview session", which described a screen that did not
 * exist. A teacher could write and publish a lesson without ever seeing what
 * a learner would get.
 *
 * The learner's own route could not be reused: `/learn/subjects/[subject]` is
 * gated to the `student` role and keyed by a demo slug, so a teacher opening
 * it is redirected back to `/teacher`. This is the same player component and
 * the same `/api/learn/subjects` data — which already accepts any school user
 * — behind the teacher's own gate, keyed by the offering they actually teach.
 *
 * It runs in preview mode, so clicking through writes no progress rows and no
 * xAPI statements. See LessonPreviewContext in the player.
 */
export default async function TeacherLessonPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ offeringId?: string }>;
}) {
  const { offeringId: requested } = await searchParams;
  const user = await requireWorkspaceUser(
    "teacher",
    requested
      ? `/teacher/subjects/preview?offeringId=${encodeURIComponent(requested)}`
      : "/teacher/subjects/preview",
  );

  /* Which subject to preview, resolved the same way every other teacher screen
     resolves it, so an id from a stale tab cannot open a subject this teacher
     does not hold. */
  const database = await getSchoolDatabase();
  const offerings = await loadTeachingOfferings(database, user.access);
  const offering = selectOffering(offerings, requested);

  if (!offering) {
    return (
      <WorkspaceShell
        activeHref="/teacher/subjects"
        eyebrow="Teaching"
        title="Preview"
        user={user}
        workspace="teacher"
      >
        <div className="workspace-empty">
          <strong>There is nothing to preview yet</strong>
          <p>
            {offerings.length === 0
              ? "You are not assigned to a subject. An administrator assigns subjects on the Academics screen."
              : "That subject is not one of yours. Choose a subject on My subjects and preview it from there."}
          </p>
        </div>
      </WorkspaceShell>
    );
  }

  const subject = await getLearnerSubject(user.access, offering.id);

  return (
    <WorkspaceShell
      activeHref="/teacher/subjects"
      contentClassName="workspace-content-flush"
      eyebrow="Teaching"
      hideTopbar
      title={`${subject.subjectName} — preview`}
      user={user}
      workspace="teacher"
    >
      <LessonPlayer fallback={subject} preview />
    </WorkspaceShell>
  );
}
