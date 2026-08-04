import { describe, expect, it } from "vitest";
import {
  AnnouncementError,
  canPostTo,
  isLive,
  validateAnnouncement,
  type Announcement,
} from "../domain/announcements/announcements";
import type { AccessContext } from "../domain/identity/types";

const headteacher: AccessContext = {
  actorPersonId: "person-admin",
  classGroupIds: [],
  linkedLearnerIds: [],
  membershipStatus: "active",
  role: "school-admin",
  subjectOfferingIds: [],
  tenantId: "tenant-greenfield",
};

const subjectTeacher: AccessContext = {
  ...headteacher,
  actorPersonId: "person-grace",
  classGroupIds: ["class-jhs2-gold"],
  role: "teacher",
  subjectOfferingIds: ["offering-science-jhs2"],
};

const classTeacher: AccessContext = {
  ...subjectTeacher,
  actorPersonId: "person-emmanuel",
  role: "class-teacher",
  subjectOfferingIds: ["offering-social-jhs2"],
};

const guardian: AccessContext = {
  ...headteacher,
  actorPersonId: "person-efua",
  linkedLearnerIds: ["person-kwame"],
  role: "guardian",
};

function notice(overrides: Partial<Announcement> = {}): Announcement {
  return {
    authorName: "Grace Mensah",
    authorPersonId: "person-grace",
    body: "The test moves to Thursday.",
    expiresAt: null,
    id: "announcement-1",
    publishAt: "2026-08-01T08:00:00.000Z",
    scopeId: "offering-science-jhs2",
    scopeLabel: "Your subject",
    scopeType: "subject",
    title: "Test moved",
    ...overrides,
  };
}

describe("who an announcement may reach", () => {
  it("lets an administrator reach the whole school", () => {
    expect(canPostTo(headteacher, "tenant", null)).toBe(true);
  });

  it("refuses a teacher the whole school", () => {
    expect(canPostTo(subjectTeacher, "tenant", null)).toBe(false);
    expect(canPostTo(classTeacher, "tenant", null)).toBe(false);
  });

  it("lets a teacher reach a subject they teach, and no other", () => {
    expect(canPostTo(subjectTeacher, "subject", "offering-science-jhs2")).toBe(
      true,
    );
    expect(canPostTo(subjectTeacher, "subject", "offering-maths-jhs2")).toBe(
      false,
    );
  });

  it("lets a class teacher reach their class, and no other", () => {
    expect(canPostTo(classTeacher, "class", "class-jhs2-gold")).toBe(true);
    expect(canPostTo(classTeacher, "class", "class-jhs1-blue")).toBe(false);
  });

  /* An administrator is not required to hold a class or a subject to reach
     one — the point of the role is that the office speaks for the school. */
  it("lets an administrator reach a class they do not teach", () => {
    expect(canPostTo(headteacher, "class", "class-jhs1-blue")).toBe(true);
    expect(canPostTo(headteacher, "subject", "offering-maths-jhs2")).toBe(true);
  });

  it("refuses everyone who does not hold the permission", () => {
    expect(canPostTo(guardian, "tenant", null)).toBe(false);
    expect(canPostTo(guardian, "class", "class-jhs2-gold")).toBe(false);
    expect(
      canPostTo({ ...headteacher, membershipStatus: "revoked" }, "tenant", null),
    ).toBe(false);
  });

  it("refuses a scoped announcement with nothing to scope it to", () => {
    expect(canPostTo(subjectTeacher, "subject", null)).toBe(false);
    expect(canPostTo(classTeacher, "class", null)).toBe(false);
  });
});

describe("when an announcement is showing", () => {
  it("shows once its publish time has arrived", () => {
    expect(isLive(notice(), "2026-08-01T07:59:59.000Z")).toBe(false);
    expect(isLive(notice(), "2026-08-01T08:00:00.000Z")).toBe(true);
  });

  it("stands indefinitely without an expiry", () => {
    expect(isLive(notice(), "2027-01-01T00:00:00.000Z")).toBe(true);
  });

  /* A notice about Thursday should stop showing on Friday by itself. */
  it("stops showing at its expiry rather than through it", () => {
    const thursday = notice({ expiresAt: "2026-08-07T08:00:00.000Z" });
    expect(isLive(thursday, "2026-08-07T07:59:59.000Z")).toBe(true);
    expect(isLive(thursday, "2026-08-07T08:00:00.000Z")).toBe(false);
  });
});

describe("what an announcement must say", () => {
  const valid = {
    body: "Thursday's trip is cancelled.",
    scopeId: "class-jhs2-gold",
    scopeType: "class" as const,
    title: "Trip cancelled",
  };

  it("accepts a complete announcement", () => {
    expect(() => validateAnnouncement(valid)).not.toThrow();
  });

  it("rejects an empty title or body", () => {
    expect(() => validateAnnouncement({ ...valid, title: "   " })).toThrow(
      AnnouncementError,
    );
    expect(() => validateAnnouncement({ ...valid, body: "  " })).toThrow(
      AnnouncementError,
    );
  });

  it("rejects a scoped announcement with no scope chosen", () => {
    expect(() =>
      validateAnnouncement({ ...valid, scopeId: null }),
    ).toThrow("Choose the class or subject this announcement is for.");
  });

  it("allows a whole-school announcement to carry no scope id", () => {
    expect(() =>
      validateAnnouncement({ ...valid, scopeId: null, scopeType: "tenant" }),
    ).not.toThrow();
  });

  it("rejects an expiry that falls before publication", () => {
    expect(() =>
      validateAnnouncement({
        ...valid,
        expiresAt: "2026-08-01T00:00:00.000Z",
        publishAt: "2026-08-02T00:00:00.000Z",
      }),
    ).toThrow("An announcement cannot stop showing before it starts.");
  });

  it("rejects a notice longer than a notice", () => {
    expect(() =>
      validateAnnouncement({ ...valid, body: "a".repeat(2001) }),
    ).toThrow(AnnouncementError);
  });
});
