import { describe, expect, it } from "vitest";
import { placeholderPdf } from "../db/demo-media";

/* ==========================================================================
   Placeholder study resources

   The demo used to insert media rows marked 'ready' with nothing behind
   them, so every lesson's Download button answered 404. These cover the file
   that replaces that — specifically the parts a reader will reject silently:
   a cross-reference table whose offsets do not land on their objects, and a
   filename that closes a PDF string early.
   ========================================================================== */

const text = (bytes: Uint8Array) =>
  Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");

describe("a placeholder study resource", () => {
  it("is a PDF a reader will open", () => {
    const pdf = text(placeholderPdf("digestive-system-study-sheet.pdf"));
    expect(pdf.startsWith("%PDF-1.4")).toBe(true);
    expect(pdf.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(pdf).toContain("/Type /Catalog");
    expect(pdf).toContain("/Type /Page ");
  });

  it("names the file it stands in for", () => {
    const pdf = text(placeholderPdf("ratio-worked-examples.pdf"));
    expect(pdf).toContain("ratio-worked-examples.pdf");
  });

  /* The offsets are the part that fails quietly: a reader given a wrong one
     shows a damaged file rather than an error worth reading. */
  it("points its cross-reference table at the real object offsets", () => {
    const bytes = placeholderPdf("notes.pdf");
    const pdf = text(bytes);
    const offsets = [...pdf.matchAll(/^(\d{10}) 00000 n $/gm)].map((match) =>
      Number(match[1]),
    );

    expect(offsets).toHaveLength(5);
    offsets.forEach((offset, index) => {
      expect(pdf.slice(offset)).toMatch(new RegExp(`^${index + 1} 0 obj`));
    });
  });

  it("points startxref at its cross-reference table", () => {
    const pdf = text(placeholderPdf("notes.pdf"));
    const startxref = Number(/startxref\n(\d+)/.exec(pdf)?.[1]);
    expect(pdf.slice(startxref)).toMatch(/^xref\n/);
  });

  /* A filename is the school's to choose, and these three characters would
     otherwise end the string the name sits inside. */
  it("escapes a filename that would break the page content", () => {
    const pdf = text(placeholderPdf("term 1 (final) \\ draft.pdf"));
    expect(pdf).toContain("term 1 \\(final\\) \\\\ draft.pdf");
    const startxref = Number(/startxref\n(\d+)/.exec(pdf)?.[1]);
    expect(pdf.slice(startxref)).toMatch(/^xref\n/);
  });

  /* Every offset is a string index, so one multi-byte character would put
     the whole table out by the difference. */
  it("stays byte-for-character with a name outside Latin-1", () => {
    const bytes = placeholderPdf("Ama's notes — Twi.pdf");
    const pdf = text(bytes);
    expect(bytes.byteLength).toBe(pdf.length);
    const offsets = [...pdf.matchAll(/^(\d{10}) 00000 n $/gm)].map((match) =>
      Number(match[1]),
    );
    offsets.forEach((offset, index) => {
      expect(pdf.slice(offset)).toMatch(new RegExp(`^${index + 1} 0 obj`));
    });
  });
});
