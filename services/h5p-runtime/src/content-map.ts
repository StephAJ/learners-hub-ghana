import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export type ContentMapEntry = {
  activityId: string;
  contentId: string;
  packageDigest: string;
  tenantId: string;
  updatedAt: string;
};

type ContentMapFile = {
  entries: ContentMapEntry[];
  version: 1;
};

export class ContentMapRepository {
  private readonly filePath: string;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(private readonly dataDirectory: string) {
    this.filePath = path.join(dataDirectory, "content-map.json");
  }

  async find(tenantId: string, activityId: string) {
    await this.writeQueue;
    const contentMap = await this.read();
    return contentMap.entries.find(
      (entry) =>
        entry.tenantId === tenantId && entry.activityId === activityId,
    );
  }

  async upsert(entry: ContentMapEntry) {
    const writeOperation = this.writeQueue.then(() =>
      this.writeEntry(entry),
    );
    this.writeQueue = writeOperation.catch(() => undefined);
    return writeOperation;
  }

  private async writeEntry(entry: ContentMapEntry) {
    const contentMap = await this.read();
    const retainedEntries = contentMap.entries.filter(
      (current) =>
        current.tenantId !== entry.tenantId ||
        current.activityId !== entry.activityId,
    );
    const nextMap: ContentMapFile = {
      entries: [...retainedEntries, entry],
      version: 1,
    };
    await this.write(nextMap);
  }

  private async read(): Promise<ContentMapFile> {
    try {
      const content = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(content) as Partial<ContentMapFile>;
      return {
        entries: Array.isArray(parsed.entries) ? parsed.entries : [],
        version: 1,
      };
    } catch (error) {
      if (isFileNotFound(error)) return { entries: [], version: 1 };
      throw error;
    }
  }

  private async write(contentMap: ContentMapFile) {
    await mkdir(this.dataDirectory, { recursive: true });
    const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
    await writeFile(
      temporaryPath,
      `${JSON.stringify(contentMap, null, 2)}\n`,
      { encoding: "utf8", mode: 0o600 },
    );
    await rename(temporaryPath, this.filePath);
  }
}

function isFileNotFound(error: unknown) {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}
