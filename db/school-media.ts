import { AuthorizationError } from "../domain/identity/authorization";
import type { AccessContext } from "../domain/identity/types";
import { getMediaStore, getSchoolDatabase } from "./index";

/* ==========================================================================
   School-wide media

   An asset that belongs to the school rather than to one class's subject
   offering — today that means a subject cover.

   The lesson media route cannot serve these: it checks the asset's offering
   against what the reader can reach, and these have no offering by design, so
   it would refuse every request. The rule here is the honest one for the
   thing being served — any active member of the school may read an image the
   school has put on a card that every learner sees.

   Deliberately narrow: only assets with no offering, so this cannot be used
   to sidestep the offering check on a lesson's own material.
   ========================================================================== */

export async function getSchoolMedia(
  access: AccessContext,
  assetId: string,
): Promise<Response> {
  if (access.membershipStatus !== "active") {
    throw new AuthorizationError("An active school membership is required.");
  }

  const database = await getSchoolDatabase();
  const asset = await database
    .prepare(
      `SELECT object_key, content_type, size_bytes, original_filename
      FROM media_assets
      WHERE tenant_id = ? AND id = ? AND offering_id IS NULL
        AND kind = 'image' AND status = 'ready'
      LIMIT 1`,
    )
    .bind(access.tenantId, assetId)
    .first<{
      content_type: string;
      object_key: string;
      original_filename: string;
      size_bytes: number;
    }>();
  if (!asset) return new Response("Not found.", { status: 404 });

  const bucket = await getMediaStore();
  const object = await bucket.get(asset.object_key);
  if (!object) return new Response("Not found.", { status: 404 });

  return new Response(object.body, {
    headers: {
      /* Longer than a document: a cover is on every subject card and does not
         change between terms. Still private — it is one school's image. */
      "cache-control": "private, max-age=3600",
      "content-length": String(asset.size_bytes),
      "content-type": asset.content_type,
      "x-content-type-options": "nosniff",
    },
  });
}
