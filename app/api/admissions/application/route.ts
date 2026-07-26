import { getChatGPTUser } from "../../../chatgpt-auth";
import {
  ApplicantApplicationError,
  getApplicantApplication,
  saveApplicantApplication,
  type SaveApplicantApplicationInput,
} from "../../../../db/applicant-repository";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) {
    return Response.json(
      { error: "Sign in is required to access your application." },
      { status: 401 },
    );
  }

  try {
    return Response.json({
      application: await getApplicantApplication(user),
      applicant: {
        displayName: user.displayName,
        email: user.email,
      },
    });
  } catch (error) {
    return applicationErrorResponse(error);
  }
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) {
    return Response.json(
      { error: "Sign in is required to save your application." },
      { status: 401 },
    );
  }

  try {
    const payload = (await request.json()) as SaveApplicantApplicationInput & {
      action?: "save" | "submit";
    };
    const application = await saveApplicantApplication(
      user,
      payload,
      payload.action === "submit",
    );
    return Response.json({ application });
  } catch (error) {
    return applicationErrorResponse(error);
  }
}

function applicationErrorResponse(error: unknown) {
  if (error instanceof ApplicantApplicationError) {
    return Response.json({ error: error.message }, { status: 422 });
  }
  return Response.json(
    {
      error:
        error instanceof Error
          ? error.message
          : "The application could not be saved.",
    },
    { status: 400 },
  );
}
