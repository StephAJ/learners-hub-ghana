export type SchoolRole =
  | "school-admin"
  | "academic-admin"
  | "admissions-officer"
  | "teacher"
  | "class-teacher"
  | "guardian"
  | "learner";

export type MembershipStatus = "invited" | "active" | "revoked";

export type Permission =
  | "people:read"
  | "people:invite"
  | "academic:manage"
  | "admissions:manage"
  | "student-record:read"
  | "lesson:create"
  | "content:manage"
  | "assessment:publish"
  | "assignment:manage"
  | "attendance:manage"
  | "timetable:manage"
  | "gradebook:manage"
  | "report:approve"
  | "report:release"
  | "report:read"
  /* Reading conversations someone has reported, and closing the report. Held
     by the school's administrators only: it is the power to read messages the
     holder is not a party to, so it is deliberately not part of teaching. */
  | "messages:moderate"
  /* Posting a notice to everyone in a scope at once. Distinct from messaging,
     which is one person writing to one person: telling thirty-eight families
     that Thursday's trip is cancelled through thirty-eight private threads is
     not something anyone will do. What the holder may reach is bounded by
     scope, not by this permission — see announcementScopesFor(). */
  | "announcement:post";

/* A school's colour. Two values only: everything else in the palette is
   derived from these in CSS, so a school cannot end up half-branded. See
   app/school-brand.ts and the brand block in app/globals.css. */
export type SchoolBrand = {
  brand: string;
  brandDeep: string;
};

/* A role says what kind of thing someone may do. These three lists say which
   records they may do it to, and together they are the whole of record scope:
   the subjects a teacher teaches, the classes they stand in front of, and the
   children a guardian is answerable for.

   Required, not optional, and that is the point. They were optional, and so
   nothing resolved them: `resolveAuthenticatedSchoolUser()` left them
   undefined and six repository-private helpers each re-derived one with their
   own copy of the same query. `canTeachOffering()` reads subjectOfferingIds
   and falls to `false` when it is missing, so any caller that forgot the
   incantation refused a teacher who was in fact assigned — silently, and
   looking exactly like a permission decision. Optional made forgetting
   invisible. Required makes it a type error.

   Resolved in one place: loadAccessScopes() in db/people-repository.ts. */
export type AccessContext = {
  actorPersonId: string;
  classGroupIds: string[];
  /* The learners in those classes. A class teacher answers for the children
     in front of them and no others, and that cannot be decided from a class
     id alone — so the list is resolved once per request beside the rest. */
  classLearnerIds: string[];
  linkedLearnerIds: string[];
  membershipStatus: MembershipStatus;
  role: SchoolRole;
  subjectOfferingIds: string[];
  tenantId: string;
};

export type DirectoryPerson = {
  email: string | null;
  id: string;
  kind: "staff" | "learner" | "guardian";
  name: string;
  phone: string | null;
  /** Passport photograph. Null until the school has taken one. */
  photoUrl: string | null;
  role: SchoolRole;
  scopeLabel: string;
  status: MembershipStatus;
};
