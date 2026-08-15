import { describe, expect, it } from "vitest";
import { parsePeopleImport } from "../domain/identity/bulk-import";

/* ==========================================================================
   Reading a pasted roll

   "Bulk import never silently skips invalid rows" is one of the data
   integrity rules the product scope says must never be weakened, and it is
   the whole reason this parses separately from importing: a school sees a
   verdict on every line before a single person is written.

   The failure to guard against is not a rejected row — that is the feature.
   It is a row that is quietly dropped, or quietly guessed at.
   ========================================================================== */

const HEADER = "First name\tLast name\tEmail\tRole\tClass\tPhone";

describe("a clean paste", () => {
  it("reads every row", () => {
    const preview = parsePeopleImport(
      [
        HEADER,
        "Kofi\tAsante\tkofi@example.gh\tlearner\tJHS 1 Blue\t",
        "Ama\tDarko\tama@example.gh\tteacher\t\t0244000000",
      ].join("\n"),
    );

    expect(preview.accepted).toHaveLength(2);
    expect(preview.rejected).toEqual([]);
    expect(preview.accepted[0].className).toBe("JHS 1 Blue");
    expect(preview.accepted[1].phone).toBe("0244000000");
  });

  it("works without a header", () => {
    const preview = parsePeopleImport(
      "Kofi\tAsante\tkofi@example.gh\tlearner\tJHS 1 Blue\t",
    );

    expect(preview.accepted).toHaveLength(1);
  });

  it("does not import the header as a person", () => {
    const preview = parsePeopleImport(HEADER);

    expect(preview.accepted).toEqual([]);
    expect(preview.rejected).toEqual([]);
  });

  it("accepts commas from somebody who exported rather than pasted", () => {
    const preview = parsePeopleImport(
      "Kofi,Asante,kofi@example.gh,learner,JHS 1 Blue,",
    );

    expect(preview.accepted).toHaveLength(1);
  });
});

describe("the kind of person each role implies", () => {
  it("is derived rather than asked for twice", () => {
    const preview = parsePeopleImport(
      [
        "Kofi\tAsante\tkofi@example.gh\tlearner\t\t",
        "Ama\tDarko\tama@example.gh\tclass teacher\t\t",
        "Yaa\tAsante\tyaa@example.gh\tguardian\t\t",
      ].join("\n"),
    );

    expect(preview.accepted.map((row) => row.kind)).toEqual([
      "learner",
      "staff",
      "guardian",
    ]);
    expect(preview.accepted[1].role).toBe("class-teacher");
  });

  it("takes the words a school actually types", () => {
    const preview = parsePeopleImport(
      [
        "Kofi\tAsante\tkofi@example.gh\tStudent\t\t",
        "Yaa\tAsante\tyaa@example.gh\tParent\t\t",
      ].join("\n"),
    );

    expect(preview.accepted.map((row) => row.role)).toEqual([
      "learner",
      "guardian",
    ]);
  });
});

describe("a row that cannot be imported", () => {
  it("is reported rather than dropped", () => {
    const preview = parsePeopleImport(
      [
        HEADER,
        "Kofi\tAsante\tkofi@example.gh\tlearner\t\t",
        "Ama\t\tama@example.gh\tteacher\t\t",
      ].join("\n"),
    );

    expect(preview.accepted).toHaveLength(1);
    expect(preview.rejected).toHaveLength(1);
    expect(preview.rejected[0].line).toBe(3);
    expect(preview.rejected[0].problem).toContain("last name");
  });

  it("says which line, counting the header the way a spreadsheet does", () => {
    const preview = parsePeopleImport(
      [HEADER, "Kofi\tAsante\tnot-an-address\tlearner\t\t"].join("\n"),
    );

    expect(preview.rejected[0].line).toBe(2);
    expect(preview.rejected[0].problem).toContain("not-an-address");
  });

  it("names the roles a school may use when it does not recognise one", () => {
    const preview = parsePeopleImport(
      "Kofi\tAsante\tkofi@example.gh\tHeadboy\t\t",
    );

    expect(preview.rejected[0].problem).toContain("class teacher");
  });

  it("catches an email repeated inside the same paste", () => {
    /* The unique index catches a clash with somebody already on the roll. It
       cannot catch two rows in one paste: the first would succeed, and the
       school would be told the import worked. */
    const preview = parsePeopleImport(
      [
        "Kofi\tAsante\tsame@example.gh\tlearner\t\t",
        "Ama\tDarko\tsame@example.gh\tlearner\t\t",
      ].join("\n"),
    );

    expect(preview.accepted).toEqual([]);
    expect(preview.rejected).toHaveLength(2);
    expect(preview.rejected[0].problem).toContain("more than once");
  });

  it("ignores blank lines rather than counting them as failures", () => {
    const preview = parsePeopleImport(
      [HEADER, "", "Kofi\tAsante\tkofi@example.gh\tlearner\t\t", ""].join("\n"),
    );

    expect(preview.accepted).toHaveLength(1);
    expect(preview.rejected).toEqual([]);
  });

  it("accounts for every non-blank line", () => {
    /* The property that matters: nothing vanishes. Every row is either
       accepted or rejected with a reason. */
    const text = [
      HEADER,
      "Kofi\tAsante\tkofi@example.gh\tlearner\t\t",
      "Ama\t\tama@example.gh\tteacher\t\t",
      "Yaa\tAsante\tyaa@example.gh\tHeadboy\t\t",
    ].join("\n");

    const preview = parsePeopleImport(text);

    expect(preview.accepted.length + preview.rejected.length).toBe(3);
    expect(preview.rows).toHaveLength(3);
  });
});

/* ==========================================================================
   Learners without email addresses

   Every row used to need one. A Ghanaian basic school importing a class of
   JHS 1 learners has names, a class and often no addresses — children of that
   age frequently do not have one. So a realistic paste had every single row
   rejected and the Add button stayed dead, which is what "import doesn't
   work" looked like from the outside.
   ========================================================================== */
describe("a class of learners with no email addresses", () => {
  it("imports", () => {
    const preview = parsePeopleImport(
      [
        HEADER,
        "Kofi\tAsante\t\tlearner\tJHS 1 Blue\t",
        "Adwoa\tNkrumah\t\tlearner\tJHS 1 Blue\t",
        "Yaw\tOwusu\t\tlearner\tJHS 1 Blue\t",
      ].join("\n"),
    );

    expect(preview.accepted).toHaveLength(3);
    expect(preview.rejected).toEqual([]);
    expect(preview.accepted[0].email).toBe("");
  });

  it("does not treat two blank addresses as a duplicate", () => {
    const preview = parsePeopleImport(
      [
        "Kofi\tAsante\t\tlearner\t\t",
        "Adwoa\tNkrumah\t\tlearner\t\t",
      ].join("\n"),
    );

    expect(preview.rejected).toEqual([]);
  });

  it("still insists on one for anybody who signs in", () => {
    const preview = parsePeopleImport(
      [
        "Grace\tMensah\t\tteacher\t\t",
        "Yaa\tAsante\t\tguardian\t\t",
      ].join("\n"),
    );

    expect(preview.accepted).toEqual([]);
    expect(preview.rejected).toHaveLength(2);
    expect(preview.rejected[0].problem).toContain("signs in");
  });

  it("still refuses one that is not an address", () => {
    const preview = parsePeopleImport(
      "Kofi\tAsante\tnot-an-address\tlearner\t\t",
    );

    expect(preview.rejected[0].problem).toContain("not-an-address");
  });
});
