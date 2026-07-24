import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { ContentMapRepository } from "../src/content-map.js";

describe("content map repository", () => {
  it("persists and replaces an activity mapping atomically", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "lh-h5p-map-"));
    const repository = new ContentMapRepository(directory);

    await repository.upsert({
      activityId: "activity-1",
      contentId: "content-1",
      packageDigest: "digest-1",
      tenantId: "school-1",
      updatedAt: "2026-07-24T10:00:00.000Z",
    });
    await repository.upsert({
      activityId: "activity-1",
      contentId: "content-1",
      packageDigest: "digest-2",
      tenantId: "school-1",
      updatedAt: "2026-07-24T10:05:00.000Z",
    });

    assert.equal(
      (await repository.find("school-1", "activity-1"))?.packageDigest,
      "digest-2",
    );
    const stored = JSON.parse(
      await readFile(path.join(directory, "content-map.json"), "utf8"),
    ) as { entries: unknown[] };
    assert.equal(stored.entries.length, 1);
  });
});
