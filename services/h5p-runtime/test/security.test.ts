import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { describe, it } from "node:test";
import {
  RequestAuthenticationError,
  verifyImportRequest,
  verifyLaunchGrant,
} from "../src/security.js";

const sharedSecret = "a-secure-runtime-secret-with-enough-entropy";

describe("runtime request security", () => {
  it("authenticates an exact package body and current timestamp", () => {
    const body = Buffer.from("valid h5p package");
    const timestamp = 1_722_000_000;
    const headers = createImportHeaders(body, timestamp);

    assert.deepEqual(
      verifyImportRequest({
        body,
        headers,
        nowSeconds: timestamp + 30,
        sharedSecret,
      }),
      {
        activityId: "activity-1",
        packageDigest: headers["x-learners-hub-digest"],
        tenantId: "school-1",
      },
    );
  });

  it("rejects modified or replayed package requests", () => {
    const body = Buffer.from("valid h5p package");
    const timestamp = 1_722_000_000;
    const headers = createImportHeaders(body, timestamp);

    assert.throws(
      () =>
        verifyImportRequest({
          body: Buffer.from("modified package"),
          headers,
          nowSeconds: timestamp,
          sharedSecret,
        }),
      RequestAuthenticationError,
    );
    assert.throws(
      () =>
        verifyImportRequest({
          body,
          headers,
          nowSeconds: timestamp + 301,
          sharedSecret,
        }),
      /expired/,
    );
  });

  it("accepts only a current launch grant for the requested content", () => {
    const nowSeconds = 1_722_000_000;
    const claims = {
      activityId: "activity-1",
      contentId: "content-42",
      exp: nowSeconds + 300,
      learnerPersonId: "learner-1",
      lessonId: "lesson-1",
      lessonVersion: 2,
      tenantId: "school-1",
    };
    const grant = createLaunchGrant(claims);

    assert.deepEqual(
      verifyLaunchGrant({
        expectedContentId: "content-42",
        grant,
        nowSeconds,
        sharedSecret,
      }),
      claims,
    );
    assert.throws(
      () =>
        verifyLaunchGrant({
          expectedContentId: "another-content",
          grant,
          nowSeconds,
          sharedSecret,
        }),
      /does not match/,
    );
    assert.throws(
      () =>
        verifyLaunchGrant({
          expectedContentId: "content-42",
          grant,
          nowSeconds: nowSeconds + 301,
          sharedSecret,
        }),
      /expired/,
    );
  });
});

function createImportHeaders(body: Buffer, timestamp: number) {
  const packageDigest = createHash("sha256").update(body).digest("base64url");
  const canonicalRequest = [
    "POST",
    "/v1/packages",
    timestamp,
    packageDigest,
    "activity-1",
    "school-1",
  ].join("\n");
  return {
    "x-learners-hub-activity": "activity-1",
    "x-learners-hub-digest": packageDigest,
    "x-learners-hub-signature": sign(canonicalRequest),
    "x-learners-hub-tenant": "school-1",
    "x-learners-hub-timestamp": String(timestamp),
  };
}

function createLaunchGrant(claims: Record<string, unknown>) {
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function sign(value: string) {
  return createHmac("sha256", sharedSecret).update(value).digest("base64url");
}
