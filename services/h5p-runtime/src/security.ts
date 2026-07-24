import {
  createHash,
  createHmac,
  timingSafeEqual,
} from "node:crypto";

const IMPORT_CLOCK_SKEW_SECONDS = 5 * 60;
const MAXIMUM_GRANT_LIFETIME_SECONDS = 10 * 60;
const identifierPattern = /^[A-Za-z0-9._:-]{1,200}$/;

type RequestHeaders = Record<string, string | string[] | undefined>;

export type LaunchClaims = {
  activityId: string;
  contentId: string;
  exp: number;
  learnerPersonId: string;
  lessonId: string;
  lessonVersion: number;
  tenantId: string;
};

export class RequestAuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RequestAuthenticationError";
  }
}

export function verifyImportRequest(input: {
  body: Buffer;
  headers: RequestHeaders;
  nowSeconds: number;
  sharedSecret: string;
}) {
  const activityId = requiredIdentifier(input.headers, "activity");
  const tenantId = requiredIdentifier(input.headers, "tenant");
  const timestamp = requiredTimestamp(input.headers);
  requireCurrentImport(timestamp, input.nowSeconds);
  const packageDigest = requiredHeader(input.headers, "digest");
  const actualDigest = createHash("sha256")
    .update(input.body)
    .digest("base64url");
  requireEqual(packageDigest, actualDigest, "Package digest");
  const signature = requiredHeader(input.headers, "signature");
  const canonicalRequest = [
    "POST",
    "/v1/packages",
    timestamp,
    packageDigest,
    activityId,
    tenantId,
  ].join("\n");
  requireValidSignature(canonicalRequest, signature, input.sharedSecret);
  return { activityId, packageDigest, tenantId };
}

export function verifyLaunchGrant(input: {
  expectedContentId: string;
  grant: string;
  nowSeconds: number;
  sharedSecret: string;
}): LaunchClaims {
  const [encodedClaims, signature, unexpectedPart] = input.grant.split(".");
  if (!encodedClaims || !signature || unexpectedPart) {
    throw new RequestAuthenticationError("The launch grant is malformed.");
  }
  requireValidSignature(encodedClaims, signature, input.sharedSecret);
  const claims = parseLaunchClaims(encodedClaims);
  if (claims.contentId !== input.expectedContentId) {
    throw new RequestAuthenticationError(
      "The launch grant does not match this content.",
    );
  }
  requireCurrentGrant(claims.exp, input.nowSeconds);
  return claims;
}

function parseLaunchClaims(encodedClaims: string): LaunchClaims {
  let value: unknown;
  try {
    value = JSON.parse(
      Buffer.from(encodedClaims, "base64url").toString("utf8"),
    );
  } catch {
    throw new RequestAuthenticationError("The launch grant is malformed.");
  }
  if (!isLaunchClaims(value)) {
    throw new RequestAuthenticationError("The launch grant is incomplete.");
  }
  return value;
}

function isLaunchClaims(value: unknown): value is LaunchClaims {
  if (!value || typeof value !== "object") return false;
  const claims = value as Record<string, unknown>;
  return (
    isIdentifier(claims.activityId) &&
    isIdentifier(claims.contentId) &&
    Number.isInteger(claims.exp) &&
    isIdentifier(claims.learnerPersonId) &&
    isIdentifier(claims.lessonId) &&
    Number.isInteger(claims.lessonVersion) &&
    Number(claims.lessonVersion) > 0 &&
    isIdentifier(claims.tenantId)
  );
}

function requiredIdentifier(headers: RequestHeaders, name: string) {
  const value = requiredHeader(headers, name);
  if (!isIdentifier(value)) {
    throw new RequestAuthenticationError(
      `The ${name} identifier is invalid.`,
    );
  }
  return value;
}

function requiredTimestamp(headers: RequestHeaders) {
  const rawTimestamp = requiredHeader(headers, "timestamp");
  if (!/^\d{10}$/.test(rawTimestamp)) {
    throw new RequestAuthenticationError("The import timestamp is invalid.");
  }
  return Number(rawTimestamp);
}

function requiredHeader(headers: RequestHeaders, name: string) {
  const value = headers[`x-learners-hub-${name}`];
  if (typeof value !== "string" || !value) {
    throw new RequestAuthenticationError(
      `The signed ${name} header is required.`,
    );
  }
  return value;
}

function requireCurrentImport(timestamp: number, nowSeconds: number) {
  if (Math.abs(nowSeconds - timestamp) > IMPORT_CLOCK_SKEW_SECONDS) {
    throw new RequestAuthenticationError(
      "The signed package request has expired.",
    );
  }
}

function requireCurrentGrant(expiresAt: number, nowSeconds: number) {
  if (expiresAt < nowSeconds) {
    throw new RequestAuthenticationError("The launch grant has expired.");
  }
  if (expiresAt > nowSeconds + MAXIMUM_GRANT_LIFETIME_SECONDS) {
    throw new RequestAuthenticationError(
      "The launch grant lifetime is invalid.",
    );
  }
}

function requireValidSignature(
  value: string,
  signature: string,
  sharedSecret: string,
) {
  const expected = createHmac("sha256", sharedSecret)
    .update(value)
    .digest("base64url");
  requireEqual(signature, expected, "Request signature");
}

function requireEqual(received: string, expected: string, label: string) {
  const receivedBytes = Buffer.from(received, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");
  if (
    receivedBytes.length !== expectedBytes.length ||
    !timingSafeEqual(receivedBytes, expectedBytes)
  ) {
    throw new RequestAuthenticationError(`${label} verification failed.`);
  }
}

function isIdentifier(value: unknown): value is string {
  return typeof value === "string" && identifierPattern.test(value);
}
