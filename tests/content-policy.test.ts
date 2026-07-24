import { describe, expect, it } from "vitest";
import {
  safeDisplayFilename,
  validateH5pEmbedUrl,
  validateInteractiveResult,
  validateUpload,
} from "../domain/content/content-policy";

describe("secure content policy", () => {
  it("accepts a matching, bounded school media upload", () => {
    expect(
      validateUpload({
        contentType: "application/pdf",
        filename: "digestive-system-notes.pdf",
        kind: "document",
        sizeBytes: 420_000,
      }),
    ).toEqual({
      extension: "pdf",
      filename: "digestive-system-notes.pdf",
    });
  });

  it("rejects extension and MIME mismatches", () => {
    expect(() =>
      validateUpload({
        contentType: "text/html",
        filename: "lesson.pdf",
        kind: "document",
        sizeBytes: 100,
      }),
    ).toThrow("file type is not valid");
  });

  it("removes path segments from display filenames", () => {
    expect(safeDisplayFilename("../../private/lesson.pdf")).toBe("lesson.pdf");
    expect(safeDisplayFilename("C:\\school\\audio.mp3")).toBe("audio.mp3");
  });

  it("accepts public HTTPS H5P embed URLs and records the exact origin", () => {
    expect(
      validateH5pEmbedUrl(
        "https://documentation.h5p.com/content/1291910063569938878/embed",
      ),
    ).toEqual({
      launchOrigin: "https://documentation.h5p.com",
      launchUrl:
        "https://documentation.h5p.com/content/1291910063569938878/embed",
    });
  });

  it("rejects insecure or local H5P launch URLs", () => {
    expect(() =>
      validateH5pEmbedUrl("http://localhost:8080/h5p/embed/1"),
    ).toThrow("public HTTPS");
  });

  it("normalizes bounded interactive results", () => {
    const result = validateInteractiveResult({
      activityId: "activity-1",
      completion: true,
      lessonId: "lesson-1",
      lessonVersion: 1,
      scorePercent: 83.6,
      statement: { verb: "completed" },
      success: true,
      verb: "completed",
    });

    expect(result.scorePercent).toBe(84);
    expect(result.statementJson).toBe('{"verb":"completed"}');
  });
});

