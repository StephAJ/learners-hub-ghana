import {
  canPerform,
  AuthorizationError,
} from "../domain/identity/authorization";
import type { AccessContext } from "../domain/identity/types";
import {
  ContentPolicyError,
  validateH5pEmbedUrl,
  validateInteractiveResult,
  validateUpload,
} from "../domain/content/content-policy";
import type {
  InteractiveActivity,
  InteractiveResultInput,
  MediaAsset,
  MediaKind,
} from "../domain/content/types";
import { getD1Database, getMediaBucket } from "./index";
import { ensureLearningFoundation } from "./learning-repository";
import {
  createLearnerH5pLaunch,
  importH5pPackage,
} from "../server/h5p-runtime";

export type TeacherContentWorkspace = {
  activities: InteractiveActivity[];
  className: string;
  mediaAssets: MediaAsset[];
  offeringId: string;
  subjectName: string;
  totalBytes: number;
};

export type CreateH5pActivityInput = {
  contentType: string;
  fallbackText: string;
  launchUrl?: string;
  offeringId: string;
  packageAssetId?: string;
  title: string;
};

export async function getTeacherContentWorkspace(
  access: AccessContext,
): Promise<TeacherContentWorkspace> {
  requireContentPermission(access);
  await ensureLearningFoundation();
  const offering = await findAccessibleOffering(access);
  return loadTeacherContentWorkspace(access.tenantId, offering);
}

export async function uploadTeacherMedia(
  access: AccessContext,
  input: {
    file: File;
    kind: MediaKind;
    offeringId: string;
  },
): Promise<TeacherContentWorkspace> {
  requireContentPermission(access);
  await ensureLearningFoundation();
  const offering = await requireAccessibleOffering(access, input.offeringId);
  const contentType = input.file.type || "application/octet-stream";
  const validated = validateUpload({
    contentType,
    filename: input.file.name,
    kind: input.kind,
    sizeBytes: input.file.size,
  });
  const assetId = crypto.randomUUID();
  const objectKey = [
    access.tenantId,
    offering.offering_id,
    `${assetId}.${validated.extension}`,
  ].join("/");
  const bucket = await getMediaBucket();

  await bucket.put(objectKey, input.file.stream(), {
    customMetadata: {
      assetId,
      offeringId: offering.offering_id,
      tenantId: access.tenantId,
    },
    httpMetadata: { contentType },
  });

  const database = await getD1Database();
  try {
    await database.batch([
      database
        .prepare(
          `INSERT INTO media_assets
            (id, tenant_id, offering_id, uploaded_by_person_id, kind,
             original_filename, content_type, size_bytes, object_key, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          assetId,
          access.tenantId,
          offering.offering_id,
          access.actorPersonId,
          input.kind,
          validated.filename,
          contentType,
          input.file.size,
          objectKey,
          input.kind === "h5p-package" ? "awaiting-runtime" : "ready",
        ),
      auditStatement(
        database,
        access,
        "content.media_uploaded",
        "media_asset",
        assetId,
        {
          contentType,
          kind: input.kind,
          offeringId: offering.offering_id,
          sizeBytes: input.file.size,
        },
      ),
    ]);
  } catch (error) {
    await bucket.delete(objectKey);
    throw error;
  }

  return loadTeacherContentWorkspace(access.tenantId, offering);
}

export async function createH5pActivity(
  access: AccessContext,
  input: CreateH5pActivityInput,
): Promise<TeacherContentWorkspace> {
  requireContentPermission(access);
  await ensureLearningFoundation();
  const offering = await requireAccessibleOffering(access, input.offeringId);
  validateH5pInput(input);
  const database = await getD1Database();
  const launch = input.launchUrl
    ? validateH5pEmbedUrl(input.launchUrl)
    : undefined;
  if (input.packageAssetId) {
    await requireH5pPackage(
      database,
      access.tenantId,
      input.offeringId,
      input.packageAssetId,
    );
  }

  const activityId = crypto.randomUUID();
  const status = launch ? "launchable" : "awaiting-runtime";
  await database.batch([
    database
      .prepare(
        `INSERT INTO interactive_activities
          (id, tenant_id, offering_id, created_by_person_id, title, provider,
           content_type, launch_url, launch_origin, package_asset_id,
           fallback_text, status)
        VALUES (?, ?, ?, ?, ?, 'h5p', ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        activityId,
        access.tenantId,
        offering.offering_id,
        access.actorPersonId,
        input.title.trim(),
        input.contentType.trim(),
        launch?.launchUrl ?? null,
        launch?.launchOrigin ?? null,
        input.packageAssetId?.trim() || null,
        input.fallbackText.trim(),
        status,
      ),
    auditStatement(
      database,
      access,
      "content.h5p_registered",
      "interactive_activity",
      activityId,
      {
        contentType: input.contentType.trim(),
        mode: launch ? "embed" : "package",
        offeringId: offering.offering_id,
      },
    ),
  ]);

  return loadTeacherContentWorkspace(access.tenantId, offering);
}

export async function activateH5pActivity(
  access: AccessContext,
  activityId: string,
): Promise<TeacherContentWorkspace> {
  requireContentPermission(access);
  await ensureLearningFoundation();
  const activity = await findAwaitingRuntimeActivity(
    access.tenantId,
    activityId,
  );
  const offering = await requireAccessibleOffering(
    access,
    activity.offering_id,
  );
  const bucket = await getMediaBucket();
  const object = await bucket.get(activity.object_key);
  if (!object) {
    throw new ContentPolicyError("The H5P package file is unavailable.");
  }
  const runtime = await importH5pPackage({
    activityId: activity.id,
    bytes: new Uint8Array(await object.arrayBuffer()),
    filename: activity.original_filename,
    tenantId: access.tenantId,
  });
  const database = await getD1Database();
  await database.batch([
    database
      .prepare(
        `UPDATE interactive_activities
        SET runtime_content_id = ?, runtime_imported_at = CURRENT_TIMESTAMP,
            launch_origin = ?, status = 'launchable',
            updated_at = CURRENT_TIMESTAMP
        WHERE tenant_id = ? AND id = ? AND status = 'awaiting-runtime'`,
      )
      .bind(
        runtime.runtimeContentId,
        runtime.launchOrigin,
        access.tenantId,
        activity.id,
      ),
    database
      .prepare(
        `UPDATE media_assets
        SET status = 'ready'
        WHERE tenant_id = ? AND id = ? AND kind = 'h5p-package'`,
      )
      .bind(access.tenantId, activity.package_asset_id),
    auditStatement(
      database,
      access,
      "content.h5p_activated",
      "interactive_activity",
      activity.id,
      {
        offeringId: activity.offering_id,
        runtimeContentId: runtime.runtimeContentId,
      },
    ),
  ]);
  return loadTeacherContentWorkspace(access.tenantId, offering);
}

export async function getMediaResponse(
  access: AccessContext,
  assetId: string,
  request: Request,
): Promise<Response> {
  const asset = await findMediaAsset(access.tenantId, assetId);
  await requireOfferingContentAccess(access, asset.offering_id);
  const bucket = await getMediaBucket();
  const range = parseByteRange(
    request.headers.get("range"),
    Number(asset.size_bytes),
  );
  const object = await bucket.get(
    asset.object_key,
    range ? { range } : undefined,
  );
  if (!object) return new Response("Media not found.", { status: 404 });

  const headers = new Headers({
    "accept-ranges": "bytes",
    "cache-control": "private, max-age=300",
    "content-type": asset.content_type,
    "x-content-type-options": "nosniff",
  });
  const disposition =
    asset.kind === "document" || asset.kind === "h5p-package"
      ? "attachment"
      : "inline";
  headers.set(
    "content-disposition",
    `${disposition}; filename*=UTF-8''${encodeURIComponent(asset.original_filename)}`,
  );
  if (range) {
    const end = range.offset + range.length - 1;
    headers.set(
      "content-range",
      `bytes ${range.offset}-${end}/${asset.size_bytes}`,
    );
    headers.set("content-length", String(range.length));
  } else {
    headers.set("content-length", String(asset.size_bytes));
  }
  return new Response(object.body, {
    headers,
    status: range ? 206 : 200,
  });
}

export async function getLearnerActivityLaunch(
  access: AccessContext,
  input: {
    activityId: string;
    lessonId: string;
    lessonVersion: number;
  },
) {
  requireLearner(access);
  const activity = await findLaunchableActivity(
    access.tenantId,
    input.activityId,
  );
  await requireOfferingContentAccess(access, activity.offering_id);
  await requireLessonActivityLink(
    access.tenantId,
    input.lessonId,
    input.lessonVersion,
    input.activityId,
  );
  const launch = activity.runtime_content_id
    ? await createLearnerH5pLaunch({
        activityId: activity.id,
        contentId: activity.runtime_content_id,
        learnerPersonId: access.actorPersonId,
        lessonId: input.lessonId,
        lessonVersion: input.lessonVersion,
        tenantId: access.tenantId,
      })
    : {
        launchOrigin: activity.launch_origin,
        launchUrl: activity.launch_url,
      };
  if (!launch.launchOrigin || !launch.launchUrl) {
    throw new ContentPolicyError(
      "This interactive activity has no playable runtime.",
    );
  }
  return {
    contentType: activity.content_type,
    fallbackText: activity.fallback_text,
    id: activity.id,
    launchOrigin: launch.launchOrigin,
    launchUrl: launch.launchUrl,
    provider: "h5p" as const,
    title: activity.title,
  };
}

export async function recordInteractiveResult(
  access: AccessContext,
  input: InteractiveResultInput,
) {
  requireLearner(access);
  const validated = validateInteractiveResult(input);
  const activity = await findLaunchableActivity(
    access.tenantId,
    validated.activityId,
  );
  await requireOfferingContentAccess(access, activity.offering_id);
  await requireLessonActivityLink(
    access.tenantId,
    validated.lessonId,
    validated.lessonVersion,
    validated.activityId,
  );
  const database = await getD1Database();
  const resultId = crypto.randomUUID();
  await database
    .prepare(
      `INSERT INTO interactive_activity_results
        (id, tenant_id, activity_id, learner_person_id, lesson_id,
         lesson_version, verb, score_percent, success, completion,
         statement_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      resultId,
      access.tenantId,
      validated.activityId,
      access.actorPersonId,
      validated.lessonId,
      validated.lessonVersion,
      validated.verb,
      validated.scorePercent ?? null,
      validated.success === undefined ? null : validated.success ? 1 : 0,
      validated.completion ? 1 : 0,
      validated.statementJson,
    )
    .run();
  return {
    completion: validated.completion,
    id: resultId,
    scorePercent: validated.scorePercent,
    verb: validated.verb,
  };
}

async function loadTeacherContentWorkspace(
  tenantId: string,
  offering: OfferingRow,
): Promise<TeacherContentWorkspace> {
  const database = await getD1Database();
  const mediaResult = await database
    .prepare(
      `SELECT id, offering_id, kind, original_filename, content_type,
              size_bytes, status, created_at
      FROM media_assets
      WHERE tenant_id = ? AND offering_id = ? AND status != 'deleted'
      ORDER BY created_at DESC`,
    )
    .bind(tenantId, offering.offering_id)
    .all<{
      content_type: string;
      created_at: string;
      id: string;
      kind: MediaAsset["kind"];
      offering_id: string;
      original_filename: string;
      size_bytes: number;
      status: MediaAsset["status"];
    }>();
  const activitiesResult = await database
    .prepare(
      `SELECT id, offering_id, title, provider, content_type, launch_url,
              launch_origin, package_asset_id, runtime_content_id,
              runtime_imported_at, fallback_text, status
      FROM interactive_activities
      WHERE tenant_id = ? AND offering_id = ? AND status != 'archived'
      ORDER BY created_at DESC`,
    )
    .bind(tenantId, offering.offering_id)
    .all<{
      content_type: string;
      fallback_text: string;
      id: string;
      launch_origin: string | null;
      launch_url: string | null;
      offering_id: string;
      package_asset_id: string | null;
      provider: "h5p";
      runtime_content_id: string | null;
      runtime_imported_at: string | null;
      status: InteractiveActivity["status"];
      title: string;
    }>();

  const mediaAssets = mediaResult.results.map(toMediaAsset);
  return {
    activities: activitiesResult.results.map((activity) => ({
      contentType: activity.content_type,
      fallbackText: activity.fallback_text,
      id: activity.id,
      launchOrigin: activity.launch_origin ?? undefined,
      launchUrl: activity.launch_url ?? undefined,
      offeringId: activity.offering_id,
      packageAssetId: activity.package_asset_id ?? undefined,
      provider: activity.provider,
      runtimeContentId: activity.runtime_content_id ?? undefined,
      runtimeImportedAt: activity.runtime_imported_at ?? undefined,
      status: activity.status,
      title: activity.title,
    })),
    className: offering.class_name,
    mediaAssets,
    offeringId: offering.offering_id,
    subjectName: offering.subject_name,
    totalBytes: mediaAssets.reduce(
      (total, asset) => total + asset.sizeBytes,
      0,
    ),
  };
}

function toMediaAsset(row: {
  content_type: string;
  created_at: string;
  id: string;
  kind: MediaAsset["kind"];
  offering_id: string;
  original_filename: string;
  size_bytes: number;
  status: MediaAsset["status"];
}): MediaAsset {
  return {
    contentType: row.content_type,
    createdAt: row.created_at,
    id: row.id,
    kind: row.kind,
    offeringId: row.offering_id,
    originalFilename: row.original_filename,
    sizeBytes: Number(row.size_bytes),
    status: row.status,
  };
}

async function findAccessibleOffering(access: AccessContext) {
  const database = await getD1Database();
  if (isAdministrator(access)) {
    const offering = await database
      .prepare(
        `SELECT o.id AS offering_id, o.class_name, s.name AS subject_name
        FROM subject_offerings o
        INNER JOIN subjects s ON s.id = o.subject_id
        WHERE o.tenant_id = ? AND o.status = 'active'
        ORDER BY s.name
        LIMIT 1`,
      )
      .bind(access.tenantId)
      .first<OfferingRow>();
    if (offering) return offering;
  } else {
    const offering = await database
      .prepare(
        `SELECT o.id AS offering_id, o.class_name, s.name AS subject_name
        FROM teacher_assignments a
        INNER JOIN subject_offerings o ON o.id = a.offering_id
        INNER JOIN subjects s ON s.id = o.subject_id
        WHERE a.tenant_id = ?
          AND a.teacher_person_id = ?
          AND a.status = 'active'
          AND o.status = 'active'
        ORDER BY s.name
        LIMIT 1`,
      )
      .bind(access.tenantId, access.actorPersonId)
      .first<OfferingRow>();
    if (offering) return offering;
  }
  throw new AuthorizationError(
    "No active subject offering is assigned to your account.",
  );
}

async function requireAccessibleOffering(
  access: AccessContext,
  offeringId: string,
) {
  const offering = await findOffering(access.tenantId, offeringId);
  await requireOfferingContentAccess(access, offeringId);
  return offering;
}

async function requireOfferingContentAccess(
  access: AccessContext,
  offeringId: string,
) {
  if (access.membershipStatus !== "active") {
    throw new AuthorizationError("An active school membership is required.");
  }
  if (isAdministrator(access)) return;
  const database = await getD1Database();
  if (access.role === "teacher") {
    const assignment = await database
      .prepare(
        `SELECT id
        FROM teacher_assignments
        WHERE tenant_id = ? AND offering_id = ?
          AND teacher_person_id = ? AND status = 'active'
        LIMIT 1`,
      )
      .bind(access.tenantId, offeringId, access.actorPersonId)
      .first<{ id: string }>();
    if (assignment) return;
  }
  if (access.role === "learner" || access.role === "class-teacher") {
    const classScope = await database
      .prepare(
        `SELECT m.id
        FROM tenant_memberships m
        INNER JOIN subject_offerings o
          ON o.tenant_id = m.tenant_id AND o.class_name = m.scope_id
        WHERE m.tenant_id = ? AND m.person_id = ?
          AND m.status = 'active' AND m.scope_type = 'class'
          AND o.id = ?
        LIMIT 1`,
      )
      .bind(access.tenantId, access.actorPersonId, offeringId)
      .first<{ id: string }>();
    if (classScope) return;
  }
  throw new AuthorizationError(
    "This content belongs to another class or subject assignment.",
  );
}

async function findOffering(tenantId: string, offeringId: string) {
  const database = await getD1Database();
  const offering = await database
    .prepare(
      `SELECT o.id AS offering_id, o.class_name, s.name AS subject_name
      FROM subject_offerings o
      INNER JOIN subjects s ON s.id = o.subject_id
      WHERE o.tenant_id = ? AND o.id = ? AND o.status = 'active'
      LIMIT 1`,
    )
    .bind(tenantId, offeringId)
    .first<OfferingRow>();
  if (!offering) throw new ContentPolicyError("Subject offering not found.");
  return offering;
}

async function findMediaAsset(tenantId: string, assetId: string) {
  const database = await getD1Database();
  const asset = await database
    .prepare(
      `SELECT id, offering_id, kind, original_filename, content_type,
              size_bytes, object_key, status
      FROM media_assets
      WHERE tenant_id = ? AND id = ?
        AND status IN ('ready', 'awaiting-runtime')
      LIMIT 1`,
    )
    .bind(tenantId, assetId)
    .first<{
      content_type: string;
      id: string;
      kind: MediaAsset["kind"];
      object_key: string;
      offering_id: string;
      original_filename: string;
      size_bytes: number;
      status: MediaAsset["status"];
    }>();
  if (!asset) throw new ContentPolicyError("Media asset not found.");
  return asset;
}

async function findLaunchableActivity(tenantId: string, activityId: string) {
  const database = await getD1Database();
  const activity = await database
    .prepare(
      `SELECT id, offering_id, title, content_type, launch_url,
              launch_origin, runtime_content_id, fallback_text
      FROM interactive_activities
      WHERE tenant_id = ? AND id = ? AND status = 'launchable'
      LIMIT 1`,
    )
    .bind(tenantId, activityId)
    .first<{
      content_type: string;
      fallback_text: string;
      id: string;
      launch_origin: string | null;
      launch_url: string | null;
      offering_id: string;
      runtime_content_id: string | null;
      title: string;
    }>();
  if (!activity) {
    throw new ContentPolicyError(
      "This interactive activity is not ready to launch.",
    );
  }
  return activity;
}

async function findAwaitingRuntimeActivity(
  tenantId: string,
  activityId: string,
) {
  const database = await getD1Database();
  const activity = await database
    .prepare(
      `SELECT a.id, a.offering_id, a.package_asset_id,
              m.object_key, m.original_filename
      FROM interactive_activities a
      INNER JOIN media_assets m
        ON m.id = a.package_asset_id AND m.tenant_id = a.tenant_id
      WHERE a.tenant_id = ? AND a.id = ?
        AND a.status = 'awaiting-runtime'
        AND m.kind = 'h5p-package'
        AND m.status = 'awaiting-runtime'
      LIMIT 1`,
    )
    .bind(tenantId, activityId)
    .first<{
      id: string;
      object_key: string;
      offering_id: string;
      original_filename: string;
      package_asset_id: string;
    }>();
  if (!activity) {
    throw new ContentPolicyError(
      "This H5P activity is not awaiting runtime activation.",
    );
  }
  return activity;
}

async function requireH5pPackage(
  database: D1Database,
  tenantId: string,
  offeringId: string,
  assetId: string,
) {
  const asset = await database
    .prepare(
      `SELECT id
      FROM media_assets
      WHERE tenant_id = ? AND offering_id = ? AND id = ?
        AND kind = 'h5p-package' AND status = 'awaiting-runtime'
      LIMIT 1`,
    )
    .bind(tenantId, offeringId, assetId)
    .first<{ id: string }>();
  if (!asset) {
    throw new ContentPolicyError(
      "Select an uploaded H5P package from this subject.",
    );
  }
}

async function requireLessonActivityLink(
  tenantId: string,
  lessonId: string,
  lessonVersion: number,
  activityId: string,
) {
  const database = await getD1Database();
  const lesson = await database
    .prepare(
      `SELECT v.id AS version_id
      FROM lessons l
      INNER JOIN lesson_versions v
        ON v.lesson_id = l.id AND v.version = l.current_version
      WHERE l.tenant_id = ? AND l.id = ? AND l.status = 'published'
        AND l.current_version = ? AND v.status = 'published'
      LIMIT 1`,
    )
    .bind(tenantId, lessonId, lessonVersion)
    .first<{ version_id: string }>();
  if (!lesson) {
    throw new ContentPolicyError(
      "Interactive results require the current published lesson.",
    );
  }
  const blocks = await database
    .prepare(
      `SELECT config
      FROM lesson_blocks
      WHERE tenant_id = ? AND lesson_version_id = ? AND type = 'interactive'`,
    )
    .bind(tenantId, lesson.version_id)
    .all<{ config: string }>();
  const linked = blocks.results.some(
    (block) => parseBlockConfig(block.config).activityId === activityId,
  );
  if (!linked) {
    throw new ContentPolicyError(
      "The interactive activity is not part of this lesson version.",
    );
  }
}

function validateH5pInput(input: CreateH5pActivityInput) {
  if (
    !input.title.trim() ||
    !input.contentType.trim() ||
    !input.fallbackText.trim()
  ) {
    throw new ContentPolicyError(
      "Title, H5P content type, and accessible fallback are required.",
    );
  }
  if (Boolean(input.launchUrl) === Boolean(input.packageAssetId)) {
    throw new ContentPolicyError(
      "Choose either an H5P embed URL or an uploaded package.",
    );
  }
}

function parseByteRange(value: string | null, sizeBytes: number) {
  if (!value) return undefined;
  const match = /^bytes=(\d+)-(\d*)$/.exec(value.trim());
  if (!match) return undefined;
  const offset = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : sizeBytes - 1;
  const end = Math.min(requestedEnd, sizeBytes - 1);
  if (
    !Number.isInteger(offset) ||
    !Number.isInteger(end) ||
    offset < 0 ||
    end < offset ||
    offset >= sizeBytes
  ) {
    return undefined;
  }
  return { length: end - offset + 1, offset };
}

function parseBlockConfig(value: string) {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object"
      ? (parsed as { activityId?: string })
      : {};
  } catch {
    return {};
  }
}

function requireContentPermission(access: AccessContext) {
  if (!canPerform(access, "content:manage")) {
    throw new AuthorizationError(
      "Your school role does not allow content management.",
    );
  }
}

function requireLearner(access: AccessContext) {
  if (
    access.membershipStatus !== "active" ||
    access.role !== "learner"
  ) {
    throw new AuthorizationError(
      "Only an active learner can record interactive results.",
    );
  }
}

function isAdministrator(access: AccessContext) {
  return (
    access.role === "school-admin" || access.role === "academic-admin"
  );
}

function auditStatement(
  database: D1Database,
  access: AccessContext,
  action: string,
  entityType: string,
  entityId: string,
  metadata: Record<string, unknown>,
) {
  return database
    .prepare(
      `INSERT INTO audit_events
        (id, tenant_id, actor_person_id, action, entity_type, entity_id, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      access.tenantId,
      access.actorPersonId,
      action,
      entityType,
      entityId,
      JSON.stringify(metadata),
    );
}

type OfferingRow = {
  class_name: string;
  offering_id: string;
  subject_name: string;
};
