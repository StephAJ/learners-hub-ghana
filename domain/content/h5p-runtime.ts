import { ContentPolicyError } from "./content-policy";

const MINIMUM_SHARED_SECRET_LENGTH = 32;
const encoder = new TextEncoder();

export type H5pRuntimeConfig = {
  baseUrl: string;
  sharedSecret: string;
};

export function validateH5pRuntimeConfig(
  input: H5pRuntimeConfig,
): H5pRuntimeConfig {
  const baseUrl = validateRuntimeUrl(input.baseUrl);
  const sharedSecret = input.sharedSecret.trim();
  if (sharedSecret.length < MINIMUM_SHARED_SECRET_LENGTH) {
    throw new ContentPolicyError(
      "The H5P runtime shared secret must contain at least 32 characters.",
    );
  }
  return { baseUrl, sharedSecret };
}

export async function createH5pImportAuthentication(input: {
  activityId: string;
  bytes: Uint8Array;
  sharedSecret: string;
  tenantId: string;
  timestamp: number;
}) {
  requireRuntimeIdentifier(input.activityId, "activity");
  requireRuntimeIdentifier(input.tenantId, "tenant");
  const packageDigest = await digestBytes(input.bytes);
  const canonicalRequest = [
    "POST",
    "/v1/packages",
    input.timestamp,
    packageDigest,
    input.activityId,
    input.tenantId,
  ].join("\n");
  return {
    packageDigest,
    signature: await signValue(canonicalRequest, input.sharedSecret),
    timestamp: String(input.timestamp),
  };
}

export async function createH5pRuntimeLaunch(input: {
  activityId: string;
  baseUrl: string;
  contentId: string;
  expiresAt: number;
  learnerPersonId: string;
  lessonId: string;
  lessonVersion: number;
  sharedSecret: string;
  tenantId: string;
}) {
  const config = validateH5pRuntimeConfig({
    baseUrl: input.baseUrl,
    sharedSecret: input.sharedSecret,
  });
  validateLaunchInput(input);
  const claims = {
    activityId: input.activityId,
    contentId: input.contentId,
    exp: input.expiresAt,
    learnerPersonId: input.learnerPersonId,
    lessonId: input.lessonId,
    lessonVersion: input.lessonVersion,
    tenantId: input.tenantId,
  };
  const encodedClaims = encodeBase64Url(encoder.encode(JSON.stringify(claims)));
  const signature = await signValue(encodedClaims, config.sharedSecret);
  const launchUrl = new URL(
    `/v1/player/${encodeURIComponent(input.contentId)}`,
    `${config.baseUrl}/`,
  );
  launchUrl.searchParams.set("grant", `${encodedClaims}.${signature}`);
  return {
    launchOrigin: launchUrl.origin,
    launchUrl: launchUrl.toString(),
  };
}

function validateRuntimeUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new ContentPolicyError("Enter a valid H5P runtime URL.");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new ContentPolicyError(
      "The H5P runtime must use an HTTPS origin without a path.",
    );
  }
  return url.origin;
}

function validateLaunchInput(input: {
  activityId: string;
  contentId: string;
  expiresAt: number;
  learnerPersonId: string;
  lessonId: string;
  lessonVersion: number;
  tenantId: string;
}) {
  requireRuntimeIdentifier(input.activityId, "activity");
  requireRuntimeIdentifier(input.contentId, "content");
  requireRuntimeIdentifier(input.learnerPersonId, "learner");
  requireRuntimeIdentifier(input.lessonId, "lesson");
  requireRuntimeIdentifier(input.tenantId, "tenant");
  if (!Number.isInteger(input.lessonVersion) || input.lessonVersion < 1) {
    throw new ContentPolicyError("A published lesson version is required.");
  }
  if (!Number.isInteger(input.expiresAt) || input.expiresAt < 1) {
    throw new ContentPolicyError("A valid runtime grant expiry is required.");
  }
}

function requireRuntimeIdentifier(value: string, label: string) {
  if (!value.trim() || value.length > 200) {
    throw new ContentPolicyError(`A valid ${label} identifier is required.`);
  }
}

async function digestBytes(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    Uint8Array.from(bytes).buffer,
  );
  return encodeBase64Url(new Uint8Array(digest));
}

async function signValue(value: string, sharedSecret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(sharedSecret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return encodeBase64Url(new Uint8Array(signature));
}

function encodeBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}
