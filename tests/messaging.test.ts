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
    classLearnerIds: [],
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
  it("places each role on its own side", () => {
    expect(messagingRoleFor(access("learner"))).toBe("learner");
    expect(messagingRoleFor(access("teacher"))).toBe("teacher");
    expect(messagingRoleFor(access("class-teacher"))).toBe("teacher");
    /* Guardians used to be refused here outright, which left the guardian
       workspace with no inbox and a school telephoning instead. What made
       them a different case is now modelled on the thread rather than used
       as a reason to exclude them — see the guardian thread tests below. */
    expect(messagingRoleFor(access("guardian"))).toBe("guardian");
  });

  it("refuses everyone else", () => {
    /* Still deliberately narrow. A school inbox that quietly admits
       administrators is a safeguarding surface nobody asked for — and an
       administrator who needs to read a conversation has the reported-message
       queue, which is audited. */
    for (const role of [
      "school-admin",
      "academic-admin",
      "admissions-officer",
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

/* ==========================================================================
   A guardian's conversation

   What made guardians "a different thing" is the property these tests pin: a
   parent-teacher thread names the child it is about, and the child is not a
   party to it. Reading learnerPersonId as a participant regardless — which is
   what the old two-sided check did — would put a learner inside their
   parent's conversation with their teacher.
   ========================================================================== */
describe("a thread between a guardian and a teacher", () => {
  const guardianThread = {
    guardianPersonId: "person-efua",
    learnerPersonId: "person-kwame",
    teacherPersonId: "person-grace",
  };

  it("has the guardian and the teacher in it", () => {
    expect(
      isThreadParticipant(access("guardian", "person-efua"), guardianThread),
    ).toBe(true);
    expect(
      isThreadParticipant(access("teacher", "person-grace"), guardianThread),
    ).toBe(true);
  });

  it("does not have the child in it", () => {
    expect(
      isThreadParticipant(access("learner", "person-kwame"), guardianThread),
      "a parent-teacher conversation is not the child's to read",
    ).toBe(false);
  });

  it("does not admit another guardian", () => {
    expect(
      isThreadParticipant(access("guardian", "person-other"), guardianThread),
    ).toBe(false);
  });

  it("leaves a learner's own thread as it was", () => {
    const learnerThread = {
      guardianPersonId: null,
      learnerPersonId: "person-kwame",
      teacherPersonId: "person-grace",
    };

    expect(
      isThreadParticipant(access("learner", "person-kwame"), learnerThread),
    ).toBe(true);
    expect(
      isThreadParticipant(access("guardian", "person-efua"), learnerThread),
    ).toBe(false);
  });
});
