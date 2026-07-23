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
  | "assessment:publish"
  | "gradebook:manage"
  | "report:approve"
  | "report:release"
  | "report:read";

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
  role: SchoolRole;
  scopeLabel: string;
  status: MembershipStatus;
};
