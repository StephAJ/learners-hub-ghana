import { describe, expect, it } from "vitest";
import {
  safeDisplayFilename,
  validateH5pEmbedUrl,
  validateInteractiveResult,
  validateUpload,
} from "../domain/content/content-policy";
import {
  createH5pImportAuthentication,
  createH5pRuntimeLaunch,
  validateH5pRuntimeConfig,
} from "../domain/content/h5p-runtime";

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

  it("requires an HTTPS self-hosted runtime and a strong shared secret", () => {
    expect(
      validateH5pRuntimeConfig({
        baseUrl: "https://h5p.school.example/",
        sharedSecret: "a-secure-runtime-secret-with-enough-entropy",
      }),
    ).toEqual({
      baseUrl: "https://h5p.school.example",
      sharedSecret: "a-secure-runtime-secret-with-enough-entropy",
    });
    expect(() =>
      validateH5pRuntimeConfig({
        baseUrl: "http://h5p.school.example",
        sharedSecret: "too-short",
      }),
    ).toThrow("HTTPS");
  });

  it("signs the exact H5P package import request", async () => {
    const first = await createH5pImportAuthentication({
      activityId: "activity-1",
      bytes: new TextEncoder().encode("package bytes"),
      sharedSecret: "a-secure-runtime-secret-with-enough-entropy",
      tenantId: "school-1",
      timestamp: 1_722_000_000,
    });
    const repeated = await createH5pImportAuthentication({
      activityId: "activity-1",
      bytes: new TextEncoder().encode("package bytes"),
      sharedSecret: "a-secure-runtime-secret-with-enough-entropy",
      tenantId: "school-1",
      timestamp: 1_722_000_000,
    });
    const changed = await createH5pImportAuthentication({
      activityId: "activity-1",
      bytes: new TextEncoder().encode("different package"),
      sharedSecret: "a-secure-runtime-secret-with-enough-entropy",
      tenantId: "school-1",
      timestamp: 1_722_000_000,
    });

    expect(first).toEqual(repeated);
    expect(first.signature).not.toBe(changed.signature);
    expect(first.packageDigest).not.toBe(changed.packageDigest);
  });

  it("creates a short-lived learner launch grant", async () => {
    const launch = await createH5pRuntimeLaunch({
      activityId: "activity-1",
      baseUrl: "https://h5p.school.example/",
      contentId: "content-42",
      expiresAt: 1_722_000_300,
      learnerPersonId: "learner-1",
      lessonId: "lesson-1",
      lessonVersion: 2,
      sharedSecret: "a-secure-runtime-secret-with-enough-entropy",
      tenantId: "school-1",
    });
    const url = new URL(launch.launchUrl);
    const [payload] = (url.searchParams.get("grant") ?? "").split(".");
    const claims = JSON.parse(
      new TextDecoder().decode(decodeBase64Url(payload)),
    ) as Record<string, unknown>;

    expect(launch.launchOrigin).toBe("https://h5p.school.example");
    expect(url.pathname).toBe("/v1/player/content-42");
    expect(claims).toMatchObject({
      activityId: "activity-1",
      contentId: "content-42",
      exp: 1_722_000_300,
      learnerPersonId: "learner-1",
      lessonId: "lesson-1",
      lessonVersion: 2,
      tenantId: "school-1",
    });
  });
});

function decodeBase64Url(value: string) {
  const padded = `${value}${"=".repeat((4 - (value.length % 4)) % 4)}`
    .replaceAll("-", "+")
    .replaceAll("_", "/");
  return Uint8Array.from(atob(padded), (character) =>
    character.charCodeAt(0),
  );
}
