export type MessageAuthorRole = "learner" | "teacher";

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
  learnerPersonId: string;
  learnerName: string;
  learnerPhotoUrl?: string | null;
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
