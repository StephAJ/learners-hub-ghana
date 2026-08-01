import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createFilesystemMediaStore,
  resolveObjectPath,
  type MediaStore,
} from "../db/media-storage";

/* This adapter can be tested against its real backing store, unlike the
   PostgreSQL one, so these tests use an actual temporary directory rather than
   a stub. */

let root: string;
let bucket: MediaStore;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "learners-hub-media-"));
  bucket = createFilesystemMediaStore(root);
});

afterEach(async () => {
  await rm(root, { force: true, recursive: true });
});

async function read(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  return Buffer.concat(chunks);
}

const KEY = "tenant-greenfield/offering-science-jhs2/asset-1.mp4";

describe("lesson media on the filesystem", () => {
  it("round-trips an upload", async () => {
    await bucket.put(KEY, new TextEncoder().encode("lesson video bytes"));
    const object = await bucket.get(KEY);
    expect(object).not.toBeNull();
    expect((await read(object!.body)).toString()).toBe("lesson video bytes");
  });

  it("creates the nested directories an object key implies", async () => {
    await bucket.put(KEY, new Uint8Array([1, 2, 3]));
    expect(await readdir(root)).toContain("tenant-greenfield");
  });

  it("returns null for a key that was never written", async () => {
    /* R2 returns null rather than throwing, and getMediaResponse turns that
       into a 404. Throwing here would surface as a 500. */
    expect(await bucket.get("tenant-greenfield/nothing/here.mp4")).toBeNull();
  });

  it("returns null rather than treating a directory as an object", async () => {
    await bucket.put(KEY, new Uint8Array([1]));
    expect(await bucket.get("tenant-greenfield/offering-science-jhs2")).toBeNull();
  });

  it("serves a byte range, which is what video seeking needs", async () => {
    await bucket.put(KEY, new TextEncoder().encode("0123456789"));
    const object = await bucket.get(KEY, { range: { length: 4, offset: 2 } });
    expect(object).not.toBeNull();
    expect((await read(object!.body)).toString()).toBe("2345");
    /* getMediaResponse builds content-range from this. */
    expect(object!.size).toBe(4);
  });

  it("clamps a range that runs past the end of the object", async () => {
    await bucket.put(KEY, new TextEncoder().encode("0123456789"));
    const object = await bucket.get(KEY, { range: { length: 500, offset: 8 } });
    expect((await read(object!.body)).toString()).toBe("89");
    expect(object!.size).toBe(2);
  });

  it("reads the whole object as an array buffer for H5P import", async () => {
    await bucket.put(KEY, new Uint8Array([80, 75, 3, 4]));
    const object = await bucket.get(KEY);
    expect(new Uint8Array(await object!.arrayBuffer())).toEqual(
      new Uint8Array([80, 75, 3, 4]),
    );
  });

  it("accepts a web stream, which is what File.stream() gives", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("chunk one "));
        controller.enqueue(new TextEncoder().encode("chunk two"));
        controller.close();
      },
    });
    await bucket.put(KEY, stream);
    const object = await bucket.get(KEY);
    expect((await read(object!.body)).toString()).toBe("chunk one chunk two");
  });

  it("keeps metadata with the object", async () => {
    await bucket.put(KEY, new Uint8Array([1]), {
      customMetadata: { assetId: "asset-1", tenantId: "tenant-greenfield" },
      httpMetadata: { contentType: "video/mp4" },
    });
    const object = await bucket.get(KEY);
    expect(object!.httpMetadata).toEqual({ contentType: "video/mp4" });
    expect(object!.customMetadata?.assetId).toBe("asset-1");
  });

  it("still serves the bytes when the metadata sidecar is damaged", async () => {
    await bucket.put(KEY, new TextEncoder().encode("bytes"), {
      httpMetadata: { contentType: "video/mp4" },
    });
    await writeFile(join(root, `${KEY}.meta.json`), "{ not json", "utf8");
    const object = await bucket.get(KEY);
    expect((await read(object!.body)).toString()).toBe("bytes");
    expect(object!.httpMetadata).toBeUndefined();
  });

  it("replaces an object rather than appending to it", async () => {
    await bucket.put(KEY, new TextEncoder().encode("first version, longer"));
    await bucket.put(KEY, new TextEncoder().encode("second"));
    const object = await bucket.get(KEY);
    expect((await read(object!.body)).toString()).toBe("second");
  });

  it("leaves no partial files behind after a write", async () => {
    /* Uploads are written to a temporary name and renamed into place, so a
       crash cannot leave a truncated file that the database already has a row
       for. Nothing ending in .part should survive a successful write. */
    await bucket.put(KEY, new TextEncoder().encode("bytes"));
    const files = await readdir(join(root, "tenant-greenfield", "offering-science-jhs2"));
    expect(files.filter((name) => name.endsWith(".part"))).toEqual([]);
  });

  it("removes the object and its metadata on delete", async () => {
    await bucket.put(KEY, new Uint8Array([1]), {
      httpMetadata: { contentType: "video/mp4" },
    });
    await bucket.delete(KEY);
    expect(await bucket.get(KEY)).toBeNull();
    const files = await readdir(
      join(root, "tenant-greenfield", "offering-science-jhs2"),
    );
    expect(files).toEqual([]);
  });

  it("treats deleting a missing object as a success", async () => {
    /* The upload path calls delete() to clean up after a failed database
       write. Throwing there would replace the real error with this one. */
    await expect(bucket.delete("tenant/offering/gone.mp4")).resolves
      .toBeUndefined();
  });
});

describe("getMediaStore wiring", () => {
  it("returns the filesystem bucket when MEDIA_STORAGE_DIR is set", async () => {
    /* The Cloudflare fallback does a dynamic import of cloudflare:workers,
       which does not resolve outside a Worker — so reaching it here would
       throw, and this passing proves the filesystem branch was taken. */
    const directory = await mkdtemp(join(tmpdir(), "learners-hub-wiring-"));
    process.env.MEDIA_STORAGE_DIR = directory;
    try {
      const { getMediaStore } = await import("../db/index");
      const configured = await getMediaStore();
      await configured.put(KEY, new TextEncoder().encode("through the wiring"));
      const object = await configured.get(KEY);
      expect(object).not.toBeNull();
      expect((await read(object!.body as ReadableStream<Uint8Array>)).toString())
        .toBe("through the wiring");
    } finally {
      delete process.env.MEDIA_STORAGE_DIR;
      await rm(directory, { force: true, recursive: true });
    }
  });
});

describe("object key safety", () => {
  const root = process.platform === "win32" ? "C:\\media" : "/srv/media";

  it("maps an ordinary key inside the root", () => {
    expect(resolveObjectPath(root, "tenant/offering/asset.mp4")).toBe(
      join(root, "tenant", "offering", "asset.mp4"),
    );
  });

  it("refuses keys that would escape the media directory", () => {
    /* Keys are built from a tenant id, an offering id and a generated UUID, so
       none of these can happen today. The cost of being wrong is reading or
       overwriting an arbitrary file on the host, so it is enforced rather than
       assumed. */
    for (const key of [
      "../secrets.env",
      "tenant/../../etc/passwd",
      "tenant/offering/../../../root/.ssh/id_rsa",
      "/etc/passwd",
      "\\windows\\system32",
      "..\\..\\secrets",
    ]) {
      expect(() => resolveObjectPath(root, key), key).toThrow();
    }
  });

  it("refuses empty keys, NUL bytes and drive letters", () => {
    for (const key of ["", "tenant/of\0fering/a.mp4", "C:/windows/system32"]) {
      expect(() => resolveObjectPath(root, key), JSON.stringify(key)).toThrow();
    }
  });

  it("allows dots inside a name, which extensions need", () => {
    expect(() =>
      resolveObjectPath(root, "tenant/offering/lesson.take.2.mp4"),
    ).not.toThrow();
  });

  it("refuses a traversal through the bucket API too", async () => {
    await expect(
      bucket.put("../escaped.mp4", new Uint8Array([1])),
    ).rejects.toThrow(/traverse upwards/);
    await expect(bucket.get("../escaped.mp4")).rejects.toThrow();
    await expect(bucket.delete("../escaped.mp4")).rejects.toThrow();
  });
});
