import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createH5pRuntime } from "../src/h5p-runtime.js";

const packagePath = process.env.H5P_SMOKE_PACKAGE;
const coreDirectory = process.env.H5P_CORE_DIR;
if (!packagePath || !coreDirectory) {
  throw new Error("H5P_SMOKE_PACKAGE and H5P_CORE_DIR are required.");
}

const bytes = await readFile(packagePath);
const dataDirectory = await mkdtemp(
  path.join(tmpdir(), "learners-hub-h5p-import-"),
);
const { runtime } = await createH5pRuntime({
  coreDirectory,
  dataDirectory,
  maxPackageBytes: 25 * 1024 * 1024,
  parentOrigin: "https://school.example",
  port: 0,
  sharedSecret: "a-secure-runtime-secret-with-enough-entropy",
});
const imported = await runtime.importPackage({
  activityId: "smoke-activity",
  bytes,
  packageDigest: createHash("sha256").update(bytes).digest("base64url"),
  tenantId: "smoke-school",
});
const html = await runtime.renderPlayer(imported.contentId, {
  activityId: "smoke-activity",
  contentId: imported.contentId,
  exp: Math.floor(Date.now() / 1000) + 300,
  learnerPersonId: "smoke-learner",
  lessonId: "smoke-lesson",
  lessonVersion: 1,
  tenantId: "smoke-school",
});

assert.match(imported.contentId, /^[0-9a-f-]{36}$/);
assert.match(html, /class="h5p-content"/);
console.log(
  JSON.stringify({
    contentId: imported.contentId,
    imported: true,
    rendered: true,
  }),
);
