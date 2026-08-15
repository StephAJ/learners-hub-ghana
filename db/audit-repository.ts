import {
  AuthorizationError,
  canPerform,
} from "../domain/identity/authorization";
import type { AuditEvent } from "../domain/identity/audit";
import type { AccessContext } from "../domain/identity/types";
import { ensurePlatformReady } from "../server/platform-ready";
import { getPostgresPool } from "./postgres";

/* ==========================================================================
   Reading the audit trail

   Every repository that changes something writes an audit event, and until now
   nothing anywhere read one. Twelve inserts, no selects. So the record existed
   for a future incident and could not answer a question today — "who changed
   this mark", "when did that guardian lose access", "who released this report"
   — which is most of what an audit trail is for.

   Read-only, and gated on report:approve rather than on people:read. Audit
   events name who did what to whom across the whole school; that is a
   leadership view, not something every teacher holding people:read should
   have.
   ========================================================================== */

export type { AuditEvent } from "../domain/identity/audit";
export { AUDIT_AREAS } from "../domain/identity/audit";

export type AuditQuery = {
  /** Only events of this kind, e.g. "report" or "guardian". */
  area?: string;
  limit?: number;
  /** Free text over the action name and the actor. */
  search?: string;
};

export async function listAuditEvents(
  access: AccessContext,
  query: AuditQuery = {},
): Promise<AuditEvent[]> {
  if (!canPerform(access, "report:approve")) {
    throw new AuthorizationError(
      "Only a school or academic administrator reads the audit trail.",
    );
  }
  await ensurePlatformReady();

  /* Capped rather than paged. An audit trail is scanned backwards from now by
     somebody answering a specific question, and a page control on a list
     nobody reads to the end of is a control nobody uses. */
  const limit = Math.min(Math.max(query.limit ?? 200, 1), 500);
  const area = (query.area ?? "").trim();
  const search = (query.search ?? "").trim().toLowerCase();

  const result = await getPostgresPool().query<{
    action: string;
    actor_name: string | null;
    created_at: string;
    entity_id: string | null;
    entity_type: string;
    id: string;
    metadata: unknown;
  }>(
    `SELECT
       event.id,
       event.action,
       event.entity_type,
       event.entity_id,
       event.metadata,
       event.created_at::text,
       actor.first_name || ' ' || actor.last_name AS actor_name
     FROM audit_events event
     LEFT JOIN people actor ON actor.id = event.actor_person_id
     WHERE event.tenant_id = $1
       AND ($2 = '' OR event.action LIKE $2 || '.%')
       AND (
         $3 = ''
         OR lower(event.action) LIKE '%' || $3 || '%'
         OR lower(coalesce(actor.first_name || ' ' || actor.last_name, '')) LIKE '%' || $3 || '%'
       )
     ORDER BY event.created_at DESC
     LIMIT $4`,
    [access.tenantId, area, search, limit],
  );

  return result.rows.map((row) => ({
    action: row.action,
    /* A deleted or never-resolved actor is "the system" rather than blank:
       an audit line with no actor reads as a gap in the record. */
    actorName: row.actor_name ?? "The system",
    at: row.created_at,
    entityId: row.entity_id ?? "",
    entityType: row.entity_type,
    id: row.id,
    metadata: isRecord(row.metadata) ? row.metadata : {},
  }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
