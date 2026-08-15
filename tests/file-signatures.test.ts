import { describe, expect, it } from "vitest";
import { verifyFileSignature } from "../domain/content/file-signatures";
import { ContentPolicyError } from "../domain/content/content-policy";

/* ==========================================================================
   Is the file what it says it is

   validateUpload() checked the extension and the content type, and a browser
   supplies both — so both are supplied by whoever is uploading. Renaming
   `payload.exe` to `photo.jpg` and setting the header to `image/jpeg` passed
   every check the product had, on a path that accepts files from learners.

   These tests are about the case that matters: a file whose name and whose
   contents disagree.
   ========================================================================== */

function bytes(...values: number[]): Uint8Array {
  return new Uint8Array([...values, 0, 1, 2, 3, 4, 5, 6, 7, 8]);
}

const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0);
const PDF = bytes(0x25, 0x50, 0x44, 0x46, 0x2d);
const ZIP = bytes(0x50, 0x4b, 0x03, 0x04);
/* MZ — a Windows executable. The thing a school is being protected from. */
const EXE = bytes(0x4d, 0x5a, 0x90, 0x00);

describe("a file that is what it claims", () => {
  it("passes for each format the product accepts", () => {
    const cases: Array<[Uint8Array, string]> = [
      [PNG, "png"],
      [JPEG, "jpg"],
      [JPEG, "jpeg"],
      [PDF, "pdf"],
      [ZIP, "docx"],
      [ZIP, "pptx"],
      [ZIP, "xlsx"],
      [ZIP, "h5p"],
    ];

    for (const [content, extension] of cases) {
      expect(() =>
        verifyFileSignature({ bytes: content, extension, kind: "document" }),
      ).not.toThrow();
    }
  });

  it("accepts an mp4 whose marker sits four bytes in", () => {
    const mp4 = new Uint8Array([
      0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d,
    ]);

    expect(() =>
      verifyFileSignature({ bytes: mp4, extension: "mp4", kind: "video" }),
    ).not.toThrow();
  });
});

describe("a file wearing somebody else's name", () => {
  it("refuses an executable called photo.jpg", () => {
    expect(() =>
      verifyFileSignature({ bytes: EXE, extension: "jpg", kind: "image" }),
    ).toThrow(ContentPolicyError);
  });

  it("refuses a zip called photo.png", () => {
    expect(() =>
      verifyFileSignature({ bytes: ZIP, extension: "png", kind: "image" }),
    ).toThrow(ContentPolicyError);
  });

  it("refuses an executable called notes.pdf", () => {
    expect(() =>
      verifyFileSignature({ bytes: EXE, extension: "pdf", kind: "document" }),
    ).toThrow(ContentPolicyError);
  });

  it("says which format it expected, so the mistake is fixable", () => {
    expect(() =>
      verifyFileSignature({ bytes: EXE, extension: "png", kind: "image" }),
    ).toThrow(/named \.png/);
  });
});

describe("plain text, which has no signature at all", () => {
  it("accepts what a school actually types", () => {
    const text = new TextEncoder().encode(
      "Term 2 reading list\r\n\tTwi poetry\n— and a dash.",
    );

    expect(() =>
      verifyFileSignature({ bytes: text, extension: "txt", kind: "document" }),
    ).not.toThrow();
  });

  it("refuses a binary called notes.txt", () => {
    expect(() =>
      verifyFileSignature({ bytes: EXE, extension: "txt", kind: "document" }),
    ).toThrow(ContentPolicyError);
  });
});

describe("an extension with no signature to check against", () => {
  it("is refused rather than waved through", () => {
    /* An allowlist that falls open is not one. */
    expect(() =>
      verifyFileSignature({ bytes: PNG, extension: "svg", kind: "image" }),
    ).toThrow(ContentPolicyError);
  });
});

describe("a file too short to carry its own signature", () => {
  it("is refused", () => {
    expect(() =>
      verifyFileSignature({
        bytes: new Uint8Array([0x89, 0x50]),
        extension: "png",
        kind: "image",
      }),
    ).toThrow(ContentPolicyError);
  });
});
