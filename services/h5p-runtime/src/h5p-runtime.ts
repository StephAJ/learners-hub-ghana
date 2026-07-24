import { access, mkdir } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import * as H5P from "@lumieducation/h5p-server";
import { ContentMapRepository } from "./content-map.js";
import type { RuntimeConfig } from "./config.js";
import { renderH5pPlayer } from "./player-renderer.js";
import {
  createAdministratorUser,
  createLearnerUser,
  RuntimePermissionSystem,
} from "./runtime-user.js";
import type { LaunchClaims } from "./security.js";

type ImportPackageInput = {
  activityId: string;
  bytes: Buffer;
  packageDigest: string;
  tenantId: string;
};

export class H5pRuntime {
  private importQueue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly editor: H5P.H5PEditor,
    private readonly player: H5P.H5PPlayer,
    private readonly contentStorage: OpaqueFileContentStorage,
    private readonly contentMap: ContentMapRepository,
  ) {}

  async importPackage(input: ImportPackageInput) {
    const operation = this.importQueue.then(() =>
      this.performImport(input),
    );
    this.importQueue = operation.catch(() => undefined);
    return operation;
  }

  async renderPlayer(contentId: string, claims: LaunchClaims) {
    const learner = createLearnerUser(
      claims.tenantId,
      claims.learnerPersonId,
    );
    return this.player.render(contentId, learner, "en", {
      contextId: `${claims.lessonId}:v${claims.lessonVersion}`,
      readOnlyState: true,
      showCopyButton: false,
      showDownloadButton: false,
      showEmbedButton: false,
      showFrame: false,
      showH5PIcon: false,
      showLicenseButton: true,
    });
  }

  private async performImport(input: ImportPackageInput) {
    const existing = await this.contentMap.find(
      input.tenantId,
      input.activityId,
    );
    if (
      existing?.packageDigest === input.packageDigest &&
      (await this.contentStorage.contentExists(existing.contentId))
    ) {
      return { contentId: existing.contentId, reused: true };
    }
    const administrator = createAdministratorUser(
      input.tenantId,
      input.activityId,
    );
    const uploaded = await this.editor.uploadPackage(
      input.bytes,
      administrator,
    );
    if (!uploaded.metadata || !uploaded.parameters) {
      throw new Error("The H5P package does not contain playable content.");
    }
    const contentId = await this.editor.saveOrUpdateContent(
      existing?.contentId ?? (undefined as unknown as H5P.ContentId),
      uploaded.parameters,
      uploaded.metadata,
      getMainLibraryUbername(uploaded.metadata),
      administrator,
    );
    await this.contentMap.upsert({
      activityId: input.activityId,
      contentId: String(contentId),
      packageDigest: input.packageDigest,
      tenantId: input.tenantId,
      updatedAt: new Date().toISOString(),
    });
    return { contentId: String(contentId), reused: false };
  }
}

export async function createH5pRuntime(config: RuntimeConfig) {
  const paths = runtimePaths(config.dataDirectory);
  await requireCoreAssets(config.coreDirectory);
  await Promise.all(
    Object.values(paths).map((directory) =>
      mkdir(directory, { recursive: true }),
    ),
  );
  const permissionSystem = new RuntimePermissionSystem();
  const h5pConfig = createH5pConfig();
  const contentStorage = new OpaqueFileContentStorage(paths.content);
  const editor = H5P.fs(
    h5pConfig,
    paths.libraries,
    paths.temporary,
    paths.content,
    undefined,
    contentStorage,
    undefined,
    undefined,
    { permissionSystem },
  );
  const player = new H5P.H5PPlayer(
    editor.libraryStorage,
    editor.contentStorage,
    h5pConfig,
    undefined,
    undefined,
    undefined,
    { permissionSystem },
  );
  player.setRenderer((model) =>
    renderH5pPlayer(model, config.parentOrigin),
  );
  return {
    editor,
    runtime: new H5pRuntime(
      editor,
      player,
      contentStorage,
      new ContentMapRepository(config.dataDirectory),
    ),
  };
}

class OpaqueFileContentStorage extends H5P.fsImplementations.FileContentStorage {
  protected async createContentId() {
    return randomUUID();
  }
}

function createH5pConfig() {
  return new H5P.H5PConfig(undefined, {
    baseUrl: "/h5p",
    contentFilesUrlPlayerOverride: "/h5p/content/{{contentId}}",
    contentHubEnabled: false,
    contentUserStateSaveInterval: false,
    maxFileSize: 25 * 1024 * 1024,
    maxTotalSize: 25 * 1024 * 1024,
    platformName: "Learners Hub",
    platformVersion: "0.1.0",
    sendUsageStatistics: false,
    setFinishedEnabled: false,
    siteType: "internet",
    uuid: "learners-hub-h5p-runtime",
  });
}

function runtimePaths(dataDirectory: string) {
  return {
    content: path.join(dataDirectory, "content"),
    editor: path.join(dataDirectory, "editor"),
    libraries: path.join(dataDirectory, "libraries"),
    temporary: path.join(dataDirectory, "temporary"),
  };
}

async function requireCoreAssets(coreDirectory: string) {
  try {
    await access(path.join(coreDirectory, "js", "h5p.js"));
  } catch {
    throw new Error(
      `H5P core assets are missing from ${coreDirectory}.`,
    );
  }
}

function getMainLibraryUbername(metadata: H5P.IContentMetadata) {
  const dependency = metadata.preloadedDependencies?.find(
    (candidate) => candidate.machineName === metadata.mainLibrary,
  );
  if (!dependency) {
    throw new Error("The H5P package has no valid main library.");
  }
  return `${dependency.machineName} ${dependency.majorVersion}.${dependency.minorVersion}`;
}
