import path from "node:path";

const DEFAULT_MAX_PACKAGE_BYTES = 25 * 1024 * 1024;
const MINIMUM_SECRET_LENGTH = 32;

export type RuntimeConfig = {
  coreDirectory: string;
  dataDirectory: string;
  maxPackageBytes: number;
  parentOrigin: string;
  port: number;
  sharedSecret: string;
};

export function loadRuntimeConfig(
  environment: NodeJS.ProcessEnv = process.env,
): RuntimeConfig {
  return {
    coreDirectory: path.resolve(
      environment.H5P_CORE_DIR ?? path.join("h5p", "core"),
    ),
    dataDirectory: path.resolve(
      environment.H5P_DATA_DIR ?? path.join("data"),
    ),
    maxPackageBytes: DEFAULT_MAX_PACKAGE_BYTES,
    parentOrigin: requireParentOrigin(environment.LEARNERS_HUB_ORIGIN),
    port: parsePort(environment.PORT),
    sharedSecret: requireSharedSecret(
      environment.H5P_RUNTIME_SHARED_SECRET,
    ),
  };
}

function requireParentOrigin(value: string | undefined) {
  if (!value) {
    throw new Error("LEARNERS_HUB_ORIGIN is required.");
  }
  const url = new URL(value);
  const isLocalDevelopment =
    url.protocol === "http:" &&
    ["localhost", "127.0.0.1"].includes(url.hostname);
  if (
    (url.protocol !== "https:" && !isLocalDevelopment) ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  ) {
    throw new Error(
      "LEARNERS_HUB_ORIGIN must be an HTTPS origin without a path.",
    );
  }
  return url.origin;
}

function requireSharedSecret(value: string | undefined) {
  const sharedSecret = value?.trim() ?? "";
  if (sharedSecret.length < MINIMUM_SECRET_LENGTH) {
    throw new Error(
      "H5P_RUNTIME_SHARED_SECRET must contain at least 32 characters.",
    );
  }
  return sharedSecret;
}

function parsePort(value: string | undefined) {
  const port = Number(value ?? "8080");
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PORT must be a valid TCP port.");
  }
  return port;
}
