import {
  createH5pImportAuthentication,
  createH5pRuntimeLaunch,
  validateH5pRuntimeConfig,
} from "../domain/content/h5p-runtime";
import { ContentPolicyError } from "../domain/content/content-policy";

const LEARNER_GRANT_LIFETIME_SECONDS = 5 * 60;

export async function importH5pPackage(input: {
  activityId: string;
  bytes: Uint8Array;
  filename: string;
  tenantId: string;
}) {
  const config = await getH5pRuntimeConfig();
  const timestamp = Math.floor(Date.now() / 1000);
  const authentication = await createH5pImportAuthentication({
    activityId: input.activityId,
    bytes: input.bytes,
    sharedSecret: config.sharedSecret,
    tenantId: input.tenantId,
    timestamp,
  });
  const response = await fetch(`${config.baseUrl}/v1/packages`, {
    body: Uint8Array.from(input.bytes).buffer,
    headers: buildImportHeaders(input, authentication),
    method: "POST",
  });
  if (!response.ok) {
    throw new ContentPolicyError(await runtimeErrorMessage(response));
  }
  const payload = (await response.json()) as { contentId?: unknown };
  if (
    typeof payload.contentId !== "string" ||
    !/^[A-Za-z0-9._:-]{1,200}$/.test(payload.contentId)
  ) {
    throw new ContentPolicyError(
      "The H5P runtime returned an invalid content identifier.",
    );
  }
  return {
    launchOrigin: new URL(config.baseUrl).origin,
    runtimeContentId: payload.contentId,
  };
}

export async function createLearnerH5pLaunch(input: {
  activityId: string;
  contentId: string;
  learnerPersonId: string;
  lessonId: string;
  lessonVersion: number;
  tenantId: string;
}) {
  const config = await getH5pRuntimeConfig();
  return createH5pRuntimeLaunch({
    ...input,
    baseUrl: config.baseUrl,
    expiresAt:
      Math.floor(Date.now() / 1000) + LEARNER_GRANT_LIFETIME_SECONDS,
    sharedSecret: config.sharedSecret,
  });
}

export async function getH5pRuntimeConfig(
  environment: {
    H5P_RUNTIME_BASE_URL?: string;
    H5P_RUNTIME_SHARED_SECRET?: string;
  } = {
    H5P_RUNTIME_BASE_URL: process.env.H5P_RUNTIME_BASE_URL,
    H5P_RUNTIME_SHARED_SECRET: process.env.H5P_RUNTIME_SHARED_SECRET,
  },
) {
  const baseUrl = environment.H5P_RUNTIME_BASE_URL;
  const sharedSecret = environment.H5P_RUNTIME_SHARED_SECRET;
  if (!baseUrl || !sharedSecret) {
    throw new ContentPolicyError(
      "The self-hosted H5P runtime is not connected yet.",
    );
  }
  return validateH5pRuntimeConfig({ baseUrl, sharedSecret });
}

function buildImportHeaders(
  input: { activityId: string; filename: string; tenantId: string },
  authentication: {
    packageDigest: string;
    signature: string;
    timestamp: string;
  },
) {
  return {
    "content-disposition": contentDisposition(input.filename),
    "content-type": "application/x-h5p",
    "x-content-type-options": "nosniff",
    "x-learners-hub-activity": input.activityId,
    "x-learners-hub-digest": authentication.packageDigest,
    "x-learners-hub-signature": authentication.signature,
    "x-learners-hub-tenant": input.tenantId,
    "x-learners-hub-timestamp": authentication.timestamp,
  };
}

function contentDisposition(filename: string) {
  return `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

async function runtimeErrorMessage(response: Response) {
  const responseText = (await response.text()).slice(0, 300).trim();
  if (response.status === 401 || response.status === 403) {
    return "The H5P runtime rejected the signed package request.";
  }
  if (response.status === 413) {
    return "The H5P runtime rejected the package because it is too large.";
  }
  return responseText || "The H5P runtime could not import this package.";
}
