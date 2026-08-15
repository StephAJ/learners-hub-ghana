/* ==========================================================================
   Who is in a conversation

   Guardians were excluded outright — "a guardian conversation is a different
   thing, with a different audit expectation, and folding it in here would
   make both worse". The reasoning was right and the exclusion was the wrong
   answer to it: teacher-to-guardian messaging is in the first release, and a
   guardian workspace with no inbox meant a school telephoned instead.

   What makes it a different thing is modelled rather than avoided. A guardian
   thread names the child it is about, and the child is not a party to it — a
   parent-teacher conversation is not the child's to read.
   ========================================================================== */
export type MessageAuthorRole = "guardian" | "learner" | "teacher";

export type Message = {
  body: string;
  id: string;
  sentAt: string;
  senderPersonId: string;
  /** Which side of the conversation sent it, for rendering without a lookup. */
  senderRole: MessageAuthorRole;
};

export type MessageThread = {
  id: string;
  /** The last message's opening, for the list. */
  preview: string;
  lastMessageAt: string;
  /* On a guardian thread this is the child the conversation is about, and
     the guardian rather than the child is the party to it. */
  learnerPersonId: string;
  learnerName: string;
  learnerPhotoUrl?: string | null;
  /** Set when the family side is a guardian rather than the learner. */
  guardianPersonId?: string | null;
  guardianName?: string | null;
  /** The subject offering this is about, when the learner picked one. */
  offeringId?: string;
  subjectName?: string;
  teacherPersonId: string;
  teacherName: string;
  teacherPhotoUrl?: string | null;
  /** Unread messages for whoever asked for this thread. */
  unreadCount: number;
};

export type MessageThreadDetail = MessageThread & {
  messages: Message[];
};

/** Who the person asking may start a conversation with. */
export type MessageRecipient = {
  personId: string;
  name: string;
  /** What they teach this learner, or which class the learner is in. */
  context: string;
  /* Which child the conversation would be about. Set when a guardian is
     choosing a teacher, and when a teacher is choosing a guardian — the
     thread names the child either way, and taking it from this list rather
     than from the request is what stops a guardian naming a child who is not
     theirs. */
  learnerPersonId?: string;
  offeringId?: string;
  photoUrl?: string | null;
};

export type ReportedThread = {
  id: string;
  learnerName: string;
  messages: Message[];
  reason: string;
  reportedAt: string;
  reportedByName: string;
  /** Which side raised it, so an administrator reads it in context. */
  reportedByRole: MessageAuthorRole;
  reviewNote?: string;
  reviewedAt?: string;
  reviewedByName?: string;
  status: "open" | "reviewed";
  teacherName: string;
  threadId: string;
};
