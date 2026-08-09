import {
  createStandard,
  deleteStandard,
  importStandards,
  listOfferingStandards,
  reorderStandards,
  setStandardStatus,
  updateStandard,
} from "../../../../db/curriculum-repository";
import {
  CurriculumStandardError,
  parseStandardsPaste,
  type CurriculumStandardInput,
} from "../../../../domain/academic/standards";
import { AuthorizationError } from "../../../../domain/identity/authorization";
import { getAuthenticatedUser } from "../../../auth";
import { resolveAuthenticatedSchoolUser } from "../../../../db/people-repository";

export const dynamic = "force-dynamic";

/* One route for the curriculum, with the action named in the body — the same
   shape as /api/admin/academic, and for the same reason: adding a standard,
   correcting one and pasting sixty are three controls on one surface. */

export async function GET(request: Request) {
  try {
    const schoolUser = await requireSchoolUser(["school-admin", "academic-admin", "teacher", "class-teacher"]);
    const offeringId =
      new URL(request.url).searchParams.get("offeringId") ?? "";
    const standards = await listOfferingStandards(
      schoolUser.access,
      offeringId,
    );
    return Response.json({ standards });
  } catch (error) {
    return curriculumErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const schoolUser = await requireSchoolUser(["school-admin", "academic-admin"]);
    const { access } = schoolUser;
    const action = (await request.json()) as {
      offeringId?: string;
      paste?: string;
      standard?: CurriculumStandardInput;
      standardId?: string;
      standardIds?: string[];
      status?: "active" | "retired";
      type?: string;
    };

    switch (action.type) {
      case "create":
        return Response.json({
          standards: await createStandard(
            access,
            action.offeringId ?? "",
            action.standard ?? ({} as CurriculumStandardInput),
          ),
        });
      case "update":
        return Response.json({
          standards: await updateStandard(
            access,
            action.standardId ?? "",
            action.standard ?? ({} as CurriculumStandardInput),
          ),
        });
      case "set-status":
        return Response.json({
          standards: await setStandardStatus(
            access,
            action.standardId ?? "",
            action.status === "retired" ? "retired" : "active",
          ),
        });
      case "delete":
        return Response.json({
          standards: await deleteStandard(access, action.standardId ?? ""),
        });
      case "reorder":
        return Response.json({
          standards: await reorderStandards(
            access,
            action.offeringId ?? "",
            action.standardIds ?? [],
          ),
        });
      /* Parsed here rather than in the repository: turning a block of pasted
         text into rows is a reading problem, and it is the part worth having
         tests for without a database. */
      case "import":
        return Response.json(
          await importStandards(
            access,
            action.offeringId ?? "",
            parseStandardsPaste(action.paste ?? ""),
          ),
        );
      default:
        return Response.json(
          { error: "That is not something this screen can do." },
          { status: 400 },
        );
    }
  } catch (error) {
    return curriculumErrorResponse(error);
  }
}

async function requireSchoolUser(roles: string[]) {
  const user = await getAuthenticatedUser();
  if (!user) throw new RequestIdentityError();
  return resolveAuthenticatedSchoolUser(
    user,
    roles as Parameters<typeof resolveAuthenticatedSchoolUser>[1],
  );
}

function curriculumErrorResponse(error: unknown) {
  if (error instanceof RequestIdentityError) {
    return Response.json({ error: error.message }, { status: 401 });
  }
  if (error instanceof AuthorizationError) {
    return Response.json({ error: error.message }, { status: 403 });
  }
  /* 422: the request was understood, and the message names the line to fix. */
  if (error instanceof CurriculumStandardError) {
    return Response.json({ error: error.message }, { status: 422 });
  }
  const message =
    error instanceof Error ? error.message : "Unable to change the curriculum.";
  const status = /duplicate key|unique constraint/i.test(message) ? 409 : 400;
  return Response.json({ error: message }, { status });
}

class RequestIdentityError extends Error {
  constructor() {
    super("Sign in is required to access school records.");
    this.name = "RequestIdentityError";
  }
}
