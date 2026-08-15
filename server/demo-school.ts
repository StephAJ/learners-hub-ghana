/* ==========================================================================
   Whether this deployment carries the demo school

   The Greenfield demo — its staff and learners, four subjects, a term of
   lessons, a question bank, a published paper with a marked attempt, a
   markbook, a timetable, a register and a released report card — used to be
   written unconditionally. Two seeds ran at boot, and four more ran lazily the
   first time anything read a learning, assessment, reporting or operations
   screen.

   Only the demo *logins* were ever behind a switch. The demo *records* were
   not, so a real school signed in to a directory holding a cast it had never
   met, a markbook holding somebody else's marks, and a released report card
   for a child who does not attend.

   DEMO_SCHOOL is that switch. DEMO_ACCOUNTS implies it, because those accounts
   attach to the demo's person rows across a foreign key and mean nothing
   without them — which also means every staging box that already sets
   DEMO_ACCOUNTS keeps working with no change to its environment.
   ========================================================================== */

function isTrue(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === "true";
}

export function demoSchoolEnabled(): boolean {
  return isTrue(process.env.DEMO_SCHOOL) || isTrue(process.env.DEMO_ACCOUNTS);
}
