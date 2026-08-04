import {
  getMessageThread,
  listMessageRecipients,
  listMessageThreads,
  reportMessageThread,
  sendMessage,
  startMessageThread,
} from "../../../db/messaging-repository";
import {
  requireSchoolRequestUser,
  schoolApiErrorResponse,
} from "../../../server/request-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const schoolUser = await requireSchoolRequestUser();
    const parameters = new URL(request.url).searchParams;
    const threadId = parameters.get("threadId");

    /* Opening a thread marks it read, which is why this is a GET that writes.
       The alternative — a separate mark-read call — is a client that can
       forget, and an inbox that never clears. */
    if (threadId) {
      const thread = await getMessageThread(schoolUser.access, threadId);
      return Response.json({ thread });
    }

    const [threads, recipients] = await Promise.all([
      listMessageThreads(schoolUser.access),
      listMessageRecipients(schoolUser.access),
    ]);
    return Response.json({ recipients, threads });
  } catch (error) {
    return schoolApiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const schoolUser = await requireSchoolRequestUser();
    const payload = (await request.json()) as
      | { action: "send"; body: string; threadId: string }
      | {
          action: "start";
          body: string;
          offeringId?: string;
          recipientPersonId: string;
        }
      | { action: "report"; reason: string; threadId: string };

    if (payload.action === "send") {
      const thread = await sendMessage(
        schoolUser.access,
        payload.threadId,
        payload.body,
      );
      return Response.json({ thread });
    }
    if (payload.action === "start") {
      const thread = await startMessageThread(
        schoolUser.access,
        payload.recipientPersonId,
        payload.body,
        payload.offeringId,
      );
      return Response.json({ thread }, { status: 201 });
    }
    if (payload.action === "report") {
      await reportMessageThread(
        schoolUser.access,
        payload.threadId,
        payload.reason,
      );
      return Response.json({ reported: true });
    }
    return Response.json({ error: "Unknown message action." }, { status: 400 });
  } catch (error) {
    return schoolApiErrorResponse(error);
  }
}
