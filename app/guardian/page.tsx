import { AnnouncementsPanel } from "../components/announcements/announcements-panel";
import Link from "next/link";
import { WorkspaceShell } from "../components/workspace-shell";
import { getGuardianSchoolDay } from "../../db/operations-repository";
import { getGuardianReportWorkspace } from "../../db/reporting-repository";
import { requireWorkspaceUser } from "../../server/workspace-auth";
import { schoolDateLabel } from "../school-time";

/* ==========================================================================
   A guardian's home screen

   This page fetched nothing. Every value on it was written into the markup:
   the child was Kwame Agyeman of JHS 2 Gold, attendance was 96%, three pieces
   of work were due, the average was 82%, and a class teacher named Mrs. E.
   Aidoo wanted project materials on Friday.

   Every guardian in every school opened it and read that as their own child's
   week. It is the same fault the learner's screens had, pointed at parents —
   and worse for naming a specific child.

   Both sources are already scoped to the children this guardian is linked to,
   through guardian_relationships; nothing here decides who may be seen.
   ========================================================================== */

export default async function GuardianHomePage({
  searchParams,
}: {
  searchParams: Promise<{ child?: string }>;
}) {
  const user = await requireWorkspaceUser("guardian", "/guardian");
  /* Which child, in the URL rather than in state: School day and Reports both
     have a switcher and this page had none, so a parent of two landed on
     whichever child sorted first with no sign the other existed. A link is
     also the only form of switcher a server component can have. */
  const { child: requestedChildId } = await searchParams;

  /* A guardian with no linked child, or a school whose records are briefly
     unreachable, gets an honest empty screen rather than someone else's. */
  const [schoolDay, reports] = await Promise.all([
    getGuardianSchoolDay(user.access, requestedChildId).catch(() => null),
    getGuardianReportWorkspace(user.access, requestedChildId).catch(() => null),
  ]);

  const child = schoolDay?.learner ?? reports?.child;
  const linkedChildren =
    schoolDay?.linkedChildren ?? reports?.linkedChildren ?? [];
  const latestReport = reports?.reports[0];
  const dueThisWeek = schoolDay?.assignments.filter(
    (assignment) =>
      assignment.status === "not-started" && withinTheWeek(assignment.dueAt),
  ).length;
  const unreadAlerts = schoolDay?.alerts.filter(
    (alert) => alert.status === "issued",
  );
  /* Work a teacher has marked and handed back, newest first — what a guardian
     opens this screen to see. */
  const recent = (schoolDay?.assignments ?? [])
    .filter(
      (assignment) =>
        assignment.status === "marked" || assignment.status === "released",
    )
    .sort((a, b) => b.dueAt.localeCompare(a.dueAt))
    .slice(0, 3);

  return (
    <WorkspaceShell
      activeHref="/guardian"
      eyebrow={schoolDateLabel()}
      title={
        child ? `${child.name} · ${child.className}` : "Your child's school"
      }
      user={user}
      workspace="guardian"
    >
      {child ? (
        <section className="guardian-child-card">
          <div className="guardian-child-identity">
            <span>{initials(child.name)}</span>
            <div>
              <small>Viewing child</small>
              <h2>{child.name}</h2>
              <p>
                {child.className} · {user.schoolName}
              </p>
            </div>
          </div>
          {linkedChildren.length > 1 ? (
            <nav aria-label="Choose a child" className="guardian-child-switch">
              {linkedChildren.map((option) => (
                <Link
                  aria-current={option.id === child.id ? "true" : undefined}
                  className={option.id === child.id ? "is-active" : undefined}
                  href={`/guardian?child=${encodeURIComponent(option.id)}`}
                  key={option.id}
                >
                  {option.name}
                </Link>
              ))}
            </nav>
          ) : null}
        </section>
      ) : (
        <section className="guardian-child-card">
          <div className="guardian-child-identity">
            <div>
              <small>No child linked</small>
              <h2>Nothing to show yet</h2>
              <p>
                The school office links a guardian to their children. Once that
                is done, their school day and reports appear here.
              </p>
            </div>
          </div>
        </section>
      )}

      <section className="workspace-metric-grid" aria-label="Child summary">
        <article>
          <small>Attendance this term</small>
          <strong>
            {schoolDay ? `${schoolDay.attendance.summary.percentage}%` : "—"}
          </strong>
          <Link href="/guardian/school-day">View attendance</Link>
        </article>
        <article>
          <small>Work due this week</small>
          <strong>{dueThisWeek ?? "—"}</strong>
          <Link href="/guardian/school-day">View school day</Link>
        </article>
        <article>
          <small>Current average</small>
          <strong>
            {latestReport ? `${latestReport.overallAverage.toFixed(1)}%` : "—"}
          </strong>
          <span>
            {latestReport
              ? latestReport.periodName
              : "No report released yet"}
          </span>
        </article>
        <article>
          <small>New school notices</small>
          <strong>{unreadAlerts?.length ?? "—"}</strong>
          <span>
            {unreadAlerts?.length === 0
              ? "Nothing new"
              : "From the school office"}
          </span>
        </article>
      </section>

      <div className="workspace-dashboard-grid">
        <section className="workspace-panel">
          <header>
            <div>
              <p className="workspace-eyebrow">Learning</p>
              <h2>Recent progress</h2>
            </div>
            <Link href="/guardian/reports">Open reports</Link>
          </header>
          {/* Three results were typed in here — a digestive system check at
              84%, a comprehension exercise, algebra at 78% "improved by 6
              percentage points". None of them belonged to the child whose
              name was above them. */}
          <div className="attention-list">
            {recent.length === 0 ? (
              <p className="attention-empty">
                {schoolDay
                  ? "No marked work yet. Results appear here as teachers return them."
                  : "Your child's work could not be loaded just now."}
              </p>
            ) : (
              recent.map((assignment) => (
                <div key={assignment.id}>
                  <span>{assignment.subjectName}</span>
                  <strong>
                    {assignment.title}
                    {assignment.score !== null
                      ? ` · ${assignment.score}/${assignment.maximumPoints}`
                      : ""}
                  </strong>
                  <small>
                    {assignment.feedback
                      ? assignment.feedback
                      : "Marked by the teacher"}
                  </small>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="workspace-panel">
          <header>
            <div>
              <p className="workspace-eyebrow">School updates</p>
              <h2>Notices and alerts</h2>
            </div>
          </header>
          {/* "All attendance registers are complete", a note from Mrs. E.
              Aidoo and "Term report is available" were all constants — the
              last two claiming things that may not be true. */}
          <div className="attention-list">
            {schoolDay?.alerts.length ? (
              schoolDay.alerts.slice(0, 3).map((alert) => (
                <Link href="/guardian/school-day" key={alert.id}>
                  <span>{alert.status === "issued" ? "New" : "Seen"}</span>
                  <strong>{alert.title}</strong>
                  <small>{alert.message}</small>
                </Link>
              ))
            ) : (
              <p className="attention-empty">
                {schoolDay
                  ? "No alerts from the school."
                  : "School updates could not be loaded just now."}
              </p>
            )}
            {latestReport ? (
              <Link href="/guardian/reports">
                <span>Reports</span>
                <strong>{latestReport.periodName} report is available</strong>
                <small>Approved and released by the school</small>
              </Link>
            ) : null}
          </div>
        </section>
      </div>

      <AnnouncementsPanel />
    </WorkspaceShell>
  );
}

/* "This week" as a guardian means it, rather than a rolling seven days from
   whenever the page was opened: work due on Friday is due this week whether
   it is read on Monday or on Thursday. */
function withinTheWeek(dueAt: string): boolean {
  const due = new Date(dueAt);
  if (Number.isNaN(due.getTime())) return false;
  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );
  const endOfWeek = new Date(startOfToday);
  /* Sunday is 0; treat the school week as ending on the coming Sunday. */
  endOfWeek.setDate(startOfToday.getDate() + ((7 - startOfToday.getDay()) % 7));
  endOfWeek.setHours(23, 59, 59, 999);
  return due >= startOfToday && due <= endOfWeek;
}

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}
