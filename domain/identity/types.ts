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
  | "report:read";

/* A school's colour. Two values only: everything else in the palette is
   derived from these in CSS, so a school cannot end up half-branded. See
   app/school-brand.ts and the brand block in app/globals.css. */
export type SchoolBrand = {
  brand: string;
  brandDeep: string;
};

export type AccessContext = {
  actorPersonId: string;
  classGroupIds?: string[];
  linkedLearnerIds?: string[];
  membershipStatus: MembershipStatus;
  role: SchoolRole;
  subjectOfferingIds?: string[];
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
