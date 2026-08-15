import { describe, expect, it } from "vitest";
import { renderReportCardPdf } from "../domain/reporting/report-pdf";

/* ==========================================================================
   The document a family keeps

   "Download" was window.print(): a different document on every device, with
   the school's navigation in the margins on some of them, and nothing at all
   on a phone that cannot print. A Ghanaian family files a report card,
   photocopies it and brings it to the next school, so it has to be one fixed
   thing.

   These tests are mostly about the bytes being a valid PDF at all — the file
   is assembled by hand, and a cross-reference table with the wrong offsets
   produces a file that opens in one reader and not another.
   ========================================================================== */

const REPORT = {
  attendance: { present: 56, total: 58 },
  className: "JHS 1 Blue",
  classTeacherComment: "A steady term with real progress in written work.",
  conduct: "Good",
  headteacherComment: "Well done.",
  issuedAt: "2026-12-18",
  learnerName: "Kofi Asante",
  overallAverage: 74.2,
  periodName: "Term 1",
  promotionDecision: "Promoted to JHS 2",
  reportId: "report-osu-1:v1",
  schoolName: "Osu Community Basic School",
  studentNumber: "OC-260001",
  subjects: [
    {
      grade: "B",
      remark: "Very good",
      scorePercent: 74.5,
      subjectName: "Integrated Science",
      teacherComment: "Strong on the practical work.",
    },
    {
      grade: "A",
      remark: "Excellent",
      scorePercent: 81,
      subjectName: "Mathematics",
      teacherComment: "",
    },
  ],
  version: 1,
};

function asText(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
}

describe("the file itself", () => {
  it("is a PDF a reader will open", () => {
    const pdf = renderReportCardPdf(REPORT);
    const text = asText(pdf);

    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
  });

  it("has a cross-reference table whose offsets are right", () => {
    /* The offsets are string indices into a document assembled as it goes. An
       object that moved without its offset moving is a file that opens in one
       reader and not another, which is the worst way for this to fail. */
    const pdf = renderReportCardPdf(REPORT);
    const text = asText(pdf);

    const startxref = Number(text.match(/startxref\n(\d+)/)?.[1]);
    expect(text.slice(startxref, startxref + 4)).toBe("xref");

    const offsets = [...text.matchAll(/^(\d{10}) 00000 n $/gm)].map((match) =>
      Number(match[1]),
    );
    expect(offsets).toHaveLength(6);
    offsets.forEach((offset, index) => {
      expect(text.slice(offset, offset + 8)).toContain(`${index + 1} 0 obj`);
    });
  });

  it("is Latin-1 throughout, so the offsets mean bytes", () => {
    const pdf = renderReportCardPdf({
      ...REPORT,
      learnerName: "Ama Boateng — Twi stream ✎",
    });

    expect(Array.from(pdf).every((byte) => byte <= 0xff)).toBe(true);
  });
});

describe("what it says", () => {
  it("names the school, the learner and the term", () => {
    const text = asText(renderReportCardPdf(REPORT));

    expect(text).toContain("Osu Community Basic School");
    expect(text).toContain("Kofi Asante");
    expect(text).toContain("Term 1");
  });

  it("lists every subject with its grade", () => {
    const text = asText(renderReportCardPdf(REPORT));

    expect(text).toContain("Integrated Science");
    expect(text).toContain("Mathematics");
    expect(text).toContain("74.5%");
    expect(text).toContain("81.0%");
  });

  it("carries the report reference and version, for checking a copy", () => {
    const text = asText(renderReportCardPdf(REPORT));

    expect(text).toContain("report-osu-1:v1");
    expect(text).toContain("version 1");
  });

  it("escapes the characters that would end a PDF string early", () => {
    const pdf = renderReportCardPdf({
      ...REPORT,
      classTeacherComment: "Improved (markedly) on last term \\ well done",
    });
    const text = asText(pdf);

    expect(text).toContain("\\(markedly\\)");
    expect(text).toContain("\\\\");
  });

  it("survives a school with no comments written yet", () => {
    expect(() =>
      renderReportCardPdf({
        ...REPORT,
        classTeacherComment: "",
        headteacherComment: "",
        promotionDecision: "",
        subjects: [],
      }),
    ).not.toThrow();
  });

  it("does not run off the page when a learner takes fourteen subjects", () => {
    const pdf = renderReportCardPdf({
      ...REPORT,
      subjects: Array.from({ length: 14 }, (_, index) => ({
        grade: "B",
        remark: "Very good",
        scorePercent: 70 + index,
        subjectName: `Subject ${index + 1}`,
        teacherComment: "A comment on this one, of ordinary length.",
      })),
    });
    const text = asText(pdf);

    /* The page says so rather than silently dropping the tail. */
    expect(text).toContain("Continued on the school");
  });
});
