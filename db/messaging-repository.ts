import {
  MessagingError,
  messagePreview,
  messagingRoleFor,
  requireActiveMessagingMembership,
  requireThreadParticipant,
  validateMessageBody,
} from "../domain/messaging/messaging";
import type {
  MessageRecipient,
  MessageThread,
  MessageThreadDetail,
  ReportedThread,
} from "../domain/messaging/types";
import { AuthorizationError, canPerform } from "../domain/identity/authorization";
import type { AccessContext } from "../domain/identity/types";
import { ensureLearningFoundation } from "./learning-repository";
import { getSchoolDatabase } from "./index";

/* ==========================================================================
   Messages between a learner and the teachers who teach them

   Who may talk to whom is decided in domain/messaging/messaging.ts; this
   module resolves that rule against the school's actual data and stores the
   result.

   "Teaches them" has no roster table behind it. A teacher is assigned to a
   subject offering, an offering names a class, and a learner belongs to a
   class through their membership scope — so the join runs
   teacher_assignments -> subject_offerings -> tenant_memberships, and there is
   nothing to keep in sync with the timetable because it is the same data the
   timetable reads.
   ========================================================================== */

type ThreadRow = {
  id: string;
  last_message_at: string;
  learner_name: string;
  learner_person_id: string;
  learner_photo_url: string | null;
  learner_read_at: string | null;
  offering_id: string | null;
  preview: string | null;
  subject_name: string | null;
  teacher_name: string;
  teacher_person_id: string;
  teacher_photo_url: string | null;
  teacher_read_at: string | null;
  unread_count: number;
};

export async function listMessageThreads(
  access: AccessContext,
): Promise<MessageThread[]> {
  requireActiveMessagingMembership(access);
  const role = messagingRoleFor(access);
  await ensureLearningFoundation();
  const database = await getSchoolDatabase();

  /* The unread count is "messages the other side sent after I last read",
     which is a comparison against one timestamp rather than a per-message
     read table. `IS NULL` covers a thread nobody has opened yet. */
  const readColumn = role === "learner" ? "t.learner_read_at" : "t.teacher_read_at";
  const mineColumn =
    role === "learner" ? "t.learner_person_id" : "t.teacher_person_id";

  const result = await database
    .prepare(
      `SELECT
        t.id,
        t.last_message_at,
        t.learner_person_id,
        t.learner_read_at,
        t.offering_id,
        t.teacher_person_id,
        t.teacher_read_at,
        lp.first_name || ' ' || lp.last_name AS learner_name,
        lp.photo_url AS learner_photo_url,
        tp.first_name || ' ' || tp.last_name AS teacher_name,
        tp.photo_url AS teacher_photo_url,
        s.name AS subject_name,
        (
          SELECT m.body
          FROM messages m
          WHERE m.thread_id = t.id
          ORDER BY m.sent_at DESC
          LIMIT 1
        ) AS preview,
        (
          SELECT COUNT(*)
          FROM messages m
          WHERE m.thread_id = t.id
            AND m.sender_person_id <> ?
            AND (${readColumn} IS NULL OR m.sent_at > ${readColumn})
        ) AS unread_count
      FROM message_threads t
      INNER JOIN people lp ON lp.id = t.learner_person_id
      INNER JOIN people tp ON tp.id = t.teacher_person_id
      LEFT JOIN subject_offerings o ON o.id = t.offering_id
      LEFT JOIN subjects s ON s.id = o.subject_id
      WHERE t.tenant_id = ? AND ${mineColumn} = ?
      ORDER BY t.last_message_at DESC`,
    )
    .bind(access.actorPersonId, access.tenantId, access.actorPersonId)
    .all<ThreadRow>();

  return result.results.map(toThread);
}

export async function countUnreadMessages(
  access: AccessContext,
): Promise<number> {
  const threads = await listMessageThreads(access);
  return threads.reduce((total, thread) => total + thread.unreadCount, 0);
}

/**
 * One conversation, and marking it read.
 *
 * Reading and marking-as-read are the same call on purpose: they are the same
 * action from the person's point of view, and splitting them invites a client
 * that opens a thread and never reports it.
 */
export async function getMessageThread(
  access: AccessContext,
  threadId: string,
): Promise<MessageThreadDetail> {
  requireActiveMessagingMembership(access);
  const role = messagingRoleFor(access);
  await ensureLearningFoundation();
  const database = await getSchoolDatabase();

  const threads = await listMessageThreads(access);
  const thread = threads.find((candidate) => candidate.id === threadId);
  if (!thread) throw new MessagingError("This conversation was not found.");
  requireThreadParticipant(access, thread);

  const result = await database
    .prepare(
      `SELECT m.id, m.body, m.sent_at, m.sender_person_id
      FROM messages m
      WHERE m.thread_id = ? AND m.tenant_id = ?
      ORDER BY m.sent_at ASC`,
    )
    .bind(threadId, access.tenantId)
    .all<{
      body: string;
      id: string;
      sender_person_id: string;
      sent_at: string;
    }>();

  await database
    .prepare(
      `UPDATE message_threads
      SET ${role === "learner" ? "learner_read_at" : "teacher_read_at"} = CURRENT_TIMESTAMP
      WHERE id = ? AND tenant_id = ?`,
    )
    .bind(threadId, access.tenantId)
    .run();

  return {
    ...thread,
    messages: result.results.map((row) => ({
      body: row.body,
      id: row.id,
      senderPersonId: row.sender_person_id,
      senderRole:
        row.sender_person_id === thread.learnerPersonId ? "learner" : "teacher",
      sentAt: row.sent_at,
    })),
    /* Read as of now, so the badge clears without a second round trip. */
    unreadCount: 0,
  };
}

export async function sendMessage(
  access: AccessContext,
  threadId: string,
  body: string,
): Promise<MessageThreadDetail> {
  requireActiveMessagingMembership(access);
  const trimmed = validateMessageBody(body);
  const role = messagingRoleFor(access);
  await ensureLearningFoundation();
  const database = await getSchoolDatabase();

  const threads = await listMessageThreads(access);
  const thread = threads.find((candidate) => candidate.id === threadId);
  if (!thread) throw new MessagingError("This conversation was not found.");
  requireThreadParticipant(access, thread);

  await database.batch([
    database
      .prepare(
        `INSERT INTO messages (id, tenant_id, thread_id, sender_person_id, body)
        VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        access.tenantId,
        threadId,
        access.actorPersonId,
        trimmed,
      ),
    /* The sender has by definition read their own message, so their side is
       stamped too — otherwise sending would leave the sender with an unread
       badge for their own words. */
    database
      .prepare(
        `UPDATE message_threads
        SET last_message_at = CURRENT_TIMESTAMP,
            ${role === "learner" ? "learner_read_at" : "teacher_read_at"} = CURRENT_TIMESTAMP
        WHERE id = ? AND tenant_id = ?`,
      )
      .bind(threadId, access.tenantId),
  ]);

  return getMessageThread(access, threadId);
}

export async function startMessageThread(
  access: AccessContext,
  recipientPersonId: string,
  body: string,
  offeringId?: string,
): Promise<MessageThreadDetail> {
  requireActiveMessagingMembership(access);
  const trimmed = validateMessageBody(body);
  const role = messagingRoleFor(access);
  await ensureLearningFoundation();
  const database = await getSchoolDatabase();

  /* The recipient has to be someone this person is allowed to write to, and
     that is decided by the same query that builds the picker — so a crafted
     request cannot reach a teacher who does not teach this learner. */
  const allowed = await listMessageRecipients(access);
  const recipient = allowed.find(
    (candidate) => candidate.personId === recipientPersonId,
  );
  if (!recipient) {
    throw new MessagingError(
      role === "learner"
        ? "You can only message a teacher who teaches you."
        : "You can only message a learner you teach.",
    );
  }

  const learnerPersonId =
    role === "learner" ? access.actorPersonId : recipientPersonId;
  const teacherPersonId =
    role === "learner" ? recipientPersonId : access.actorPersonId;

  /* Two people have one conversation, not one per time either of them pressed
     New. Starting a thread with someone already written to used to insert a
     second row, so an inbox filled with repeated names and the history of
     what had been said was split across them.

     Matched on the pair alone rather than the pair and the offering: a
     teacher who takes a class for both Science and Mathematics is still the
     same person to that learner, and splitting by subject would put half a
     conversation behind each. The offering on the thread stays as the one it
     was opened from, which is all it is used for — a label. */
  const existing = await database
    .prepare(
      `SELECT id
      FROM message_threads
      WHERE tenant_id = ? AND learner_person_id = ? AND teacher_person_id = ?
      ORDER BY created_at
      LIMIT 1`,
    )
    .bind(access.tenantId, learnerPersonId, teacherPersonId)
    .first<{ id: string }>();
  if (existing) {
    return sendMessage(access, existing.id, trimmed);
  }

  const threadId = crypto.randomUUID();

  await database.batch([
    database
      .prepare(
        `INSERT INTO message_threads
          (id, tenant_id, learner_person_id, teacher_person_id, offering_id,
           started_by_person_id,
           ${role === "learner" ? "learner_read_at" : "teacher_read_at"})
        VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      )
      .bind(
        threadId,
        access.tenantId,
        learnerPersonId,
        teacherPersonId,
        offeringId ?? recipient.offeringId ?? null,
        access.actorPersonId,
      ),
    database
      .prepare(
        `INSERT INTO messages (id, tenant_id, thread_id, sender_person_id, body)
        VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        access.tenantId,
        threadId,
        access.actorPersonId,
        trimmed,
      ),
  ]);

  return getMessageThread(access, threadId);
}

/**
 * Everyone this person may start a conversation with.
 *
 * Also the authorisation check for starting one — see startMessageThread.
 * Having the picker and the guard read from one query is the point: a list
 * that showed more than the guard allowed would be a broken feature, and a
 * guard that allowed more than the list showed would be a hole.
 */
export async function listMessageRecipients(
  access: AccessContext,
): Promise<MessageRecipient[]> {
  requireActiveMessagingMembership(access);
  const role = messagingRoleFor(access);
  await ensureLearningFoundation();
  const database = await getSchoolDatabase();

  if (role === "learner") {
    const result = await database
      .prepare(
        `SELECT DISTINCT
          p.id AS person_id,
          p.first_name || ' ' || p.last_name AS name,
          p.photo_url,
          s.name AS subject_name,
          o.id AS offering_id
        FROM tenant_memberships me
        INNER JOIN subject_offerings o
          ON o.tenant_id = me.tenant_id AND o.class_name = me.scope_id
        INNER JOIN teacher_assignments ta
          ON ta.offering_id = o.id AND ta.status = 'active'
        INNER JOIN people p ON p.id = ta.teacher_person_id
        INNER JOIN subjects s ON s.id = o.subject_id
        WHERE me.tenant_id = ?
          AND me.person_id = ?
          AND me.scope_type = 'class'
          AND o.status = 'active'
        ORDER BY name`,
      )
      .bind(access.tenantId, access.actorPersonId)
      .all<{
        name: string;
        offering_id: string;
        person_id: string;
        photo_url: string | null;
        subject_name: string;
      }>();

    return result.results.map((row) => ({
      context: `Teaches you ${row.subject_name}`,
      name: row.name,
      offeringId: row.offering_id,
      personId: row.person_id,
      photoUrl: row.photo_url,
    }));
  }

  /* A teacher writes to the learners in the classes they teach. */
  const result = await database
    .prepare(
      `SELECT DISTINCT
        p.id AS person_id,
        p.first_name || ' ' || p.last_name AS name,
        p.photo_url,
        me.scope_id AS class_name
      FROM teacher_assignments ta
      INNER JOIN subject_offerings o
        ON o.id = ta.offering_id AND o.status = 'active'
      INNER JOIN tenant_memberships me
        ON me.tenant_id = ta.tenant_id
        AND me.scope_type = 'class'
        AND me.scope_id = o.class_name
        AND me.role = 'learner'
        AND me.status = 'active'
      INNER JOIN people p ON p.id = me.person_id
      WHERE ta.tenant_id = ?
        AND ta.teacher_person_id = ?
        AND ta.status = 'active'
      ORDER BY name`,
    )
    .bind(access.tenantId, access.actorPersonId)
    .all<{
      class_name: string;
      name: string;
      person_id: string;
      photo_url: string | null;
    }>();

  return result.results.map((row) => ({
    context: row.class_name,
    name: row.name,
    personId: row.person_id,
    photoUrl: row.photo_url,
  }));
}

function toThread(row: ThreadRow): MessageThread {
  return {
    id: row.id,
    lastMessageAt: row.last_message_at,
    learnerName: row.learner_name,
    learnerPersonId: row.learner_person_id,
    learnerPhotoUrl: row.learner_photo_url,
    offeringId: row.offering_id ?? undefined,
    preview: row.preview ? messagePreview(row.preview) : "",
    subjectName: row.subject_name ?? undefined,
    teacherName: row.teacher_name,
    teacherPersonId: row.teacher_person_id,
    teacherPhotoUrl: row.teacher_photo_url,
    unreadCount: Number(row.unread_count) || 0,
  };
}

export { MessagingError };

/* ==========================================================================
   Reporting a conversation

   Either party can ask the school to look at a thread. That is the whole of
   moderation here, and it is deliberately not deletion: a learner who is
   being spoken to badly needs the messages to still exist when an
   administrator opens them, and a teacher who is being accused needs the same.
   Nothing in this feature removes a message.

   Reading a reported conversation is the power to read messages you are not a
   party to, so it sits behind its own permission rather than behind "is an
   administrator" — see messages:moderate in domain/identity/authorization.ts.
   ========================================================================== */

export async function reportMessageThread(
  access: AccessContext,
  threadId: string,
  reason: string,
): Promise<void> {
  requireActiveMessagingMembership(access);
  await ensureLearningFoundation();
  const database = await getSchoolDatabase();

  /* Only a participant may report, and listMessageThreads already scopes to
     the caller's own threads — so this both finds it and proves standing. */
  const threads = await listMessageThreads(access);
  const thread = threads.find((candidate) => candidate.id === threadId);
  if (!thread) throw new MessagingError("This conversation was not found.");
  requireThreadParticipant(access, thread);

  const existing = await database
    .prepare(
      `SELECT id FROM message_reports
      WHERE thread_id = ? AND reported_by_person_id = ? AND status = 'open'
      LIMIT 1`,
    )
    .bind(threadId, access.actorPersonId)
    .all<{ id: string }>();
  if (existing.results.length > 0) {
    throw new MessagingError(
      "You have already reported this conversation. The school will look at it.",
    );
  }

  await database
    .prepare(
      `INSERT INTO message_reports
        (id, tenant_id, thread_id, reported_by_person_id, reason)
      VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      access.tenantId,
      threadId,
      access.actorPersonId,
      reason.trim().slice(0, 500),
    )
    .run();
}

export async function listReportedThreads(
  access: AccessContext,
): Promise<ReportedThread[]> {
  if (!canPerform(access, "messages:moderate")) {
    throw new AuthorizationError(
      "You do not have permission to review reported conversations.",
    );
  }
  await ensureLearningFoundation();
  const database = await getSchoolDatabase();

  const reports = await database
    .prepare(
      `SELECT
        r.id,
        r.created_at,
        r.reason,
        r.review_note,
        r.reviewed_at,
        r.status,
        r.thread_id,
        t.learner_person_id,
        lp.first_name || ' ' || lp.last_name AS learner_name,
        tp.first_name || ' ' || tp.last_name AS teacher_name,
        rp.first_name || ' ' || rp.last_name AS reported_by_name,
        r.reported_by_person_id,
        vp.first_name || ' ' || vp.last_name AS reviewed_by_name
      FROM message_reports r
      INNER JOIN message_threads t ON t.id = r.thread_id
      INNER JOIN people lp ON lp.id = t.learner_person_id
      INNER JOIN people tp ON tp.id = t.teacher_person_id
      INNER JOIN people rp ON rp.id = r.reported_by_person_id
      LEFT JOIN people vp ON vp.id = r.reviewed_by_person_id
      WHERE r.tenant_id = ?
      ORDER BY
        CASE r.status WHEN 'open' THEN 0 ELSE 1 END,
        r.created_at DESC`,
    )
    .bind(access.tenantId)
    .all<{
      created_at: string;
      id: string;
      learner_name: string;
      learner_person_id: string;
      reason: string;
      reported_by_name: string;
      reported_by_person_id: string;
      review_note: string | null;
      reviewed_at: string | null;
      reviewed_by_name: string | null;
      status: "open" | "reviewed";
      teacher_name: string;
      thread_id: string;
    }>();

  const detailed: ReportedThread[] = [];
  for (const report of reports.results) {
    const transcript = await database
      .prepare(
        `SELECT m.id, m.body, m.sent_at, m.sender_person_id
        FROM messages m
        WHERE m.thread_id = ? AND m.tenant_id = ?
        ORDER BY m.sent_at ASC`,
      )
      .bind(report.thread_id, access.tenantId)
      .all<{
        body: string;
        id: string;
        sender_person_id: string;
        sent_at: string;
      }>();

    detailed.push({
      id: report.id,
      learnerName: report.learner_name,
      messages: transcript.results.map((row) => ({
        body: row.body,
        id: row.id,
        senderPersonId: row.sender_person_id,
        senderRole:
          row.sender_person_id === report.learner_person_id
            ? "learner"
            : "teacher",
        sentAt: row.sent_at,
      })),
      reason: report.reason,
      reportedAt: report.created_at,
      reportedByName: report.reported_by_name,
      reportedByRole:
        report.reported_by_person_id === report.learner_person_id
          ? "learner"
          : "teacher",
      reviewNote: report.review_note ?? undefined,
      reviewedAt: report.reviewed_at ?? undefined,
      reviewedByName: report.reviewed_by_name ?? undefined,
      status: report.status,
      teacherName: report.teacher_name,
      threadId: report.thread_id,
    });
  }
  return detailed;
}

export async function reviewMessageReport(
  access: AccessContext,
  reportId: string,
  note: string,
): Promise<ReportedThread[]> {
  if (!canPerform(access, "messages:moderate")) {
    throw new AuthorizationError(
      "You do not have permission to review reported conversations.",
    );
  }
  await ensureLearningFoundation();
  const database = await getSchoolDatabase();

  await database
    .prepare(
      `UPDATE message_reports
      SET status = 'reviewed',
          reviewed_by_person_id = ?,
          reviewed_at = CURRENT_TIMESTAMP,
          review_note = ?
      WHERE id = ? AND tenant_id = ? AND status = 'open'`,
    )
    .bind(access.actorPersonId, note.trim().slice(0, 500), reportId, access.tenantId)
    .run();

  return listReportedThreads(access);
}
