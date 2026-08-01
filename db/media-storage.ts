import { createReadStream } from "node:fs";
import { mkdir, rename, rm, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createWriteStream } from "node:fs";

/* ==========================================================================
   Lesson media on the filesystem

   db/content-repository.ts stores uploads through a Cloudflare R2 binding.
   The VPS has no such binding, so uploading a file and streaming it back both
   throw there — the last piece of the product still tied to Cloudflare after
   the D1 port.

   The repository uses four R2 operations: put, get, get with a byte range, and
   delete. This implements those against a directory, which on the VPS is a
   named Docker volume — the same way PostgreSQL and the H5P runtime already
   persist. An object store would mean another container competing for memory
   on a box that is already close to its limit, for a single-node deployment
   that would not use the redundancy.

   Object keys are `tenantId/offeringId/uuid.ext`, so they map onto directories
   directly and stay tenant-separated on disk.
   ========================================================================== */

export type MediaRange = { length: number; offset: number };

export type MediaPutOptions = {
  customMetadata?: Record<string, string>;
  httpMetadata?: { contentType?: string };
};

export interface MediaObject {
  arrayBuffer(): Promise<ArrayBuffer>;
  body: ReadableStream<Uint8Array>;
  customMetadata?: Record<string, string>;
  httpMetadata?: { contentType?: string };
  size: number;
}

export interface MediaStore {
  delete(key: string): Promise<void>;
  get(
    key: string,
    options?: { range?: MediaRange },
  ): Promise<MediaObject | null>;
  put(
    key: string,
    value: ReadableStream<Uint8Array> | ArrayBuffer | Uint8Array | string,
    options?: MediaPutOptions,
  ): Promise<void>;
}

/** R2 keeps metadata on the object; on a filesystem it needs somewhere to live. */
const METADATA_SUFFIX = ".meta.json";

type StoredMetadata = {
  customMetadata?: Record<string, string>;
  httpMetadata?: { contentType?: string };
};

export function createFilesystemMediaStore(rootDirectory: string): MediaStore {
  const root = resolve(rootDirectory);

  return {
    async put(key, value, options) {
      const path = resolveObjectPath(root, key);
      await mkdir(dirname(path), { recursive: true });

      /* Written beside the target and renamed into place. A crash or a failed
         upload part-way through would otherwise leave a truncated file that
         the database already has a row for, and it would serve as a valid but
         corrupt video. rename() within one filesystem is atomic. */
      const pending = `${path}.${crypto.randomUUID()}.part`;
      try {
        await writeStream(pending, value);
        if (options?.customMetadata || options?.httpMetadata) {
          await writeFile(
            `${pending}${METADATA_SUFFIX}`,
            JSON.stringify({
              customMetadata: options.customMetadata,
              httpMetadata: options.httpMetadata,
            } satisfies StoredMetadata),
            "utf8",
          );
          await rename(
            `${pending}${METADATA_SUFFIX}`,
            `${path}${METADATA_SUFFIX}`,
          );
        }
        await rename(pending, path);
      } catch (error) {
        await discard(pending);
        await discard(`${pending}${METADATA_SUFFIX}`);
        throw error;
      }
    },

    async get(key, options) {
      const path = resolveObjectPath(root, key);
      const stats = await stat(path).catch(() => undefined);
      /* R2 returns null for a missing key rather than throwing, and the
         repository turns that into a 404. A directory at the key is treated
         the same way: it is not an object. */
      if (!stats?.isFile()) return null;

      const range = options?.range;
      const start = range ? Math.max(0, range.offset) : 0;
      /* R2 ranges are offset plus length; Node's read streams take an
         inclusive end. */
      const end = range
        ? Math.min(stats.size - 1, start + range.length - 1)
        : stats.size - 1;
      const size = end < start ? 0 : end - start + 1;

      const metadata = await readMetadata(path);

      return {
        arrayBuffer: async () => {
          const chunks: Buffer[] = [];
          for await (const chunk of createReadStream(path, { end, start })) {
            chunks.push(chunk as Buffer);
          }
          const joined = Buffer.concat(chunks);
          return joined.buffer.slice(
            joined.byteOffset,
            joined.byteOffset + joined.byteLength,
          ) as ArrayBuffer;
        },
        /* Streamed rather than buffered: a lesson video is streamed to a
           learner on a slow connection, and reading it into memory first would
           hold the whole file per request. */
        body: Readable.toWeb(
          createReadStream(path, { end, start }),
        ) as ReadableStream<Uint8Array>,
        customMetadata: metadata?.customMetadata,
        httpMetadata: metadata?.httpMetadata,
        size,
      };
    },

    async delete(key) {
      const path = resolveObjectPath(root, key);
      /* Deleting something already gone is not an error in R2. */
      await discard(path);
      await discard(`${path}${METADATA_SUFFIX}`);
    },
  };
}

/**
 * Maps an object key onto a path inside the root, refusing anything that would
 * escape it.
 *
 * Today's keys are built from a tenant id, an offering id and a generated
 * UUID, so none of this can currently trigger. It is here because the cost of
 * being wrong is reading or overwriting an arbitrary file on the host, and a
 * future call site should not have to know that.
 */
export function resolveObjectPath(root: string, key: string): string {
  if (!key || key.startsWith("/") || key.startsWith("\\")) {
    throw new Error(`Object key must be relative: ${key}`);
  }
  /* Checked before resolution as well as after: a key containing a NUL byte
     or a drive letter can confuse path handling before resolve() sees it. */
  if (key.includes("\0") || /^[a-zA-Z]:/.test(key)) {
    throw new Error(`Object key is not a valid path: ${key}`);
  }
  if (key.split(/[/\\]/).includes("..")) {
    throw new Error(`Object key must not traverse upwards: ${key}`);
  }

  const path = resolve(join(root, key));
  const boundary = root.endsWith(sep) ? root : `${root}${sep}`;
  if (!path.startsWith(boundary)) {
    throw new Error(`Object key escapes the media directory: ${key}`);
  }
  return path;
}

async function writeStream(
  path: string,
  value: ReadableStream<Uint8Array> | ArrayBuffer | Uint8Array | string,
): Promise<void> {
  if (typeof value === "string") {
    await writeFile(path, value, "utf8");
    return;
  }
  if (value instanceof Uint8Array) {
    await writeFile(path, value);
    return;
  }
  if (value instanceof ArrayBuffer) {
    await writeFile(path, Buffer.from(value));
    return;
  }
  /* The DOM ReadableStream a File.stream() produces and the one
     node:stream/web declares are the same object at runtime but separate
     types, so the bridge needs a cast. */
  await pipeline(
    Readable.fromWeb(value as Parameters<typeof Readable.fromWeb>[0]),
    createWriteStream(path),
  );
}

async function readMetadata(path: string): Promise<StoredMetadata | undefined> {
  const { readFile } = await import("node:fs/promises");
  const raw = await readFile(`${path}${METADATA_SUFFIX}`, "utf8").catch(
    () => undefined,
  );
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as StoredMetadata;
  } catch {
    /* A damaged sidecar must not make the object itself unreadable — the
       bytes are what the learner needs. */
    return undefined;
  }
}

async function discard(path: string): Promise<void> {
  await unlink(path).catch(async (error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return;
    /* Windows reports EPERM for a directory here; rm covers both. */
    await rm(path, { force: true, recursive: false }).catch(() => undefined);
  });
}
