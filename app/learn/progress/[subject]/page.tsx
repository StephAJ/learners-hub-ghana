import Link from "next/link";
import { learnerMastery } from "../../../../db/mastery-repository";
import { masteryWording } from "../../../../domain/learning/mastery";
import { subjectHue } from "../../../../domain/school/subject-hue";
import { WorkspaceShell } from "../../../components/workspace-shell";
import { requireWorkspaceUser } from "../../../../server/workspace-auth";
import "./progress.css";

export const dynamic = "force-dynamic";

/* ==========================================================================
   How a learner is getting on, by outcome

   The two numbers this replaces were a percentage of lessons opened and a
   mark out of a hundred. Neither answers "what should I work on": the first
   measures attendance at the material, and the second averages six different
   skills into one figure a learner cannot act on.

   Every row here is one of the school's own curriculum outcomes, and says
   plainly whether it has been taught, tested, and got right. A learner who is
   fine on fractions and lost on decimals sees exactly that instead of 62%.

   Server-rendered with no client component at all. Nothing on this page
   changes without a new mark, so there is nothing to hydrate.
   ========================================================================== */
export default async function LearnerProgressPage({
  params,
}: {
  params: Promise<{ subject: string }>;
}) {
  const { subject } = await params;
  const user = await requireWorkspaceUser("student", `/learn/progress/${subject}`);
  const mastery = await learnerMastery(user.access, { offeringId: subject });
  const hue = subjectHue(mastery.subjectName);

  return (
    <WorkspaceShell
      activeHref="/learn/subjects"
      eyebrow="My progress"
      title={mastery.subjectName}
      user={user}
      workspace="student"
    >
      <div className="mastery" data-hue={hue}>
        {mastery.standards.length === 0 ? (
          <div className="mastery-empty">
            <h2>No outcomes set for this subject yet</h2>
            <p>
              Your teacher writes what this subject should teach you, and this
              page fills in as you cover and are tested on each one.
            </p>
            <Link href="/learn/subjects">Back to my subjects</Link>
          </div>
        ) : (
          <>
            <section className="mastery-summary">
              <p className="mastery-headline">
                You can do <b>{mastery.secureCount}</b> of the{" "}
                <b>{mastery.standards.length}</b>{" "}
                {mastery.standards.length === 1 ? "thing" : "things"} this
                subject asks.
              </p>
              <p className="mastery-note">
                An outcome counts once you have got it right on more than one
                question in a paper your teacher has given back. Practice does
                not count towards this &mdash; and does not count against it.
              </p>
            </section>

            <ol className="mastery-list">
              {mastery.standards.map((standard) => (
                <li className={`mastery-row is-${standard.state}`} key={standard.standardId}>
                  <div className="mastery-row-head">
                    <span className="mastery-code">{standard.code}</span>
                    <span className={`mastery-state is-${standard.state}`}>
                      {masteryWording(standard.state)}
                    </span>
                  </div>

                  <p className="mastery-description">{standard.description}</p>

                  <div className="mastery-evidence">
                    <span>
                      {standard.lessonsTotal === 0
                        ? "No lessons cover this yet"
                        : `${standard.lessonsDone} of ${standard.lessonsTotal} ${
                            standard.lessonsTotal === 1 ? "lesson" : "lessons"
                          } finished`}
                    </span>
                    <span>
                      {standard.attempted === 0
                        ? "Not tested yet"
                        : `${standard.correct} of ${standard.attempted} right in papers`}
                    </span>
                  </div>
                </li>
              ))}
            </ol>

            <p className="mastery-foot">
              <Link href={`/learn/practice/${subject}`}>
                Practise this subject
              </Link>{" "}
              &mdash; nothing there is recorded, so it is a safe place to work
              on the ones that say &ldquo;still working on this&rdquo;.
            </p>
          </>
        )}
      </div>
    </WorkspaceShell>
  );
}
