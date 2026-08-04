import { describe, expect, it } from "vitest";
import {
  MESSAGE_MAX_LENGTH,
  MessagingError,
  isThreadParticipant,
  messagePreview,
  messagingRoleFor,
  requireActiveMessagingMembership,
  requireThreadParticipant,
  validateMessageBody,
} from "../domain/messaging/messaging";
import { AuthorizationError, canPerform } from "../domain/identity/authorization";
import type { AccessContext, SchoolRole } from "../domain/identity/types";

function access(
  role: SchoolRole,
  actorPersonId = "person-kwame",
  membershipStatus: AccessContext["membershipStatus"] = "active",
): AccessContext {
  return {
    actorPersonId,
    classGroupIds: [],
    linkedLearnerIds: [],
    membershipStatus,
    role,
    subjectOfferingIds: [],
    tenantId: "tenant-greenfield",
  };
}

const thread = {
  learnerPersonId: "person-kwame",
  teacherPersonId: "person-grace",
};

describe("who may use messages", () => {
  it("places learners and teachers on their own side", () => {
    expect(messagingRoleFor(access("learner"))).toBe("learner");
    expect(messagingRoleFor(access("teacher"))).toBe("teacher");
    expect(messagingRoleFor(access("class-teacher"))).toBe("teacher");
  });

  it("refuses everyone else", () => {
    /* Deliberately narrow. A school inbox that quietly admits administrators
       and guardians is a safeguarding surface nobody asked for. */
    for (const role of [
      "school-admin",
      "academic-admin",
      "admissions-officer",
      "guardian",
    ] as SchoolRole[]) {
      expect(() => messagingRoleFor(access(role))).toThrow(AuthorizationError);
    }
  });

  it("requires an active membership", () => {
    expect(() =>
      requireActiveMessagingMembership(access("learner", "person-kwame", "invited")),
    ).toThrow(AuthorizationError);
    expect(() =>
      requireActiveMessagingMembership(access("learner")),
    ).not.toThrow();
  });
});

describe("reading someone else's conversation", () => {
  it("admits both participants and nobody else", () => {
    expect(isThreadParticipant(access("learner", "person-kwame"), thread)).toBe(
      true,
    );
    expect(isThreadParticipant(access("teacher", "person-grace"), thread)).toBe(
      true,
    );
    /* Another teacher, with a perfectly valid teacher role. */
    expect(isThreadParticipant(access("teacher", "person-kofi"), thread)).toBe(
      false,
    );
    /* A classmate. */
    expect(isThreadParticipant(access("learner", "person-ama"), thread)).toBe(
      false,
    );
  });

  it("throws for a non-participant", () => {
    expect(() =>
      requireThreadParticipant(access("teacher", "person-kofi"), thread),
    ).toThrow(AuthorizationError);
  });
});

describe("what may be sent", () => {
  it("trims and requires something to send", () => {
    expect(validateMessageBody("  Hello sir  ")).toBe("Hello sir");
    expect(() => validateMessageBody("   ")).toThrow(MessagingError);
    expect(() => validateMessageBody("\n\n")).toThrow(MessagingError);
  });

  it("caps the length", () => {
    expect(() =>
      validateMessageBody("a".repeat(MESSAGE_MAX_LENGTH + 1)),
    ).toThrow(MessagingError);
    expect(validateMessageBody("a".repeat(MESSAGE_MAX_LENGTH))).toHaveLength(
      MESSAGE_MAX_LENGTH,
    );
  });
});

describe("the thread list preview", () => {
  it("flattens whitespace so a message cannot preview as blank", () => {
    expect(messagePreview("\n\n  Good morning\n  sir  ")).toBe(
      "Good morning sir",
    );
  });

  it("cuts on a word boundary", () => {
    const source =
      "Please could you explain the difference between the small intestine and the large intestine before Friday";
    const preview = messagePreview(source, 40);

    expect(preview.endsWith("…")).toBe(true);
    expect(preview.length).toBeLessThanOrEqual(41);

    /* "Ends on a word boundary" means the kept text is a prefix of the source
       and the source continues with a space — not that the last character is
       punctuation, which is what a naive check would assert and which a
       correctly cut "…the difference…" would fail. */
    const kept = preview.slice(0, -1);
    expect(source.startsWith(kept)).toBe(true);
    expect(source.charAt(kept.length)).toBe(" ");
  });

  it("leaves a short message alone", () => {
    expect(messagePreview("Thank you sir")).toBe("Thank you sir");
  });
});

describe("who may read a reported conversation", () => {
  it("is the school's administrators, and nobody who teaches", () => {
    /* messages:moderate is the power to read messages you are not a party to.
       A teacher holding it would be able to read every conversation in the
       school by reporting it themselves. */
    for (const role of ["school-admin", "academic-admin"] as SchoolRole[]) {
      expect(canPerform(access(role), "messages:moderate")).toBe(true);
    }
    for (const role of [
      "teacher",
      "class-teacher",
      "admissions-officer",
      "guardian",
      "learner",
    ] as SchoolRole[]) {
      expect(canPerform(access(role), "messages:moderate")).toBe(false);
    }
  });

  it("is refused to an administrator whose membership is not active", () => {
    expect(
      canPerform(
        access("school-admin", "person-admin", "invited"),
        "messages:moderate",
      ),
    ).toBe(false);
  });
});
