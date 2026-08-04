import { getAuthenticatedUser } from "../../../auth";
import { resolveAuthenticatedSchoolUser } from "../../../../db/people-repository";
import { listAcademicYears } from "../../../../db/academic-repository";
import {
  countApplicationsByIntake,
  createIntake,
  listIntakes,
  setIntakeStatus,
  updateIntake,
} from "../../../../db/intake-repository";
import { AuthorizationError } from "../../../../domain/identity/authorization";
import { SchoolStructureError } from "../../../../domain/academic/structure";

export const dynamic = "force-dynamic";

/* ==========================================================================
   Opening and closing admissions

   The capability the admin workspace was missing most visibly: its own home
   page listed "Open the public admissions intake" as the next step, and
   there was nothing anywhere that could do it.
   ========================================================================== */

type IntakeAction =
  | { intake: Parameters<typeof createIntake>[1]; type: "create" }
  | {
      intake: Parameters<typeof updateIntake>[2];
      intakeId: string;
      type: "update";
    }
  | { intakeId: string; status: "closed" | "draft" | "open"; type: "status" };

export async function GET() {
  try {
    const schoolUser = await requireSchoolUser();
    const [intakes, applicationCounts, years] = await Promise.all([
      listIntakes(schoolUser.access),
      countApplicationsByIntake(schoolUser.access),
      listAcademicYears(schoolUser.access),
    ]);
    return Response.json({ applicationCounts, intakes, years });
  } catch (error) {
    return intakeErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const schoolUser = await requireSchoolUser();
    const action = (await request.json()) as IntakeAction;
    const { access } = schoolUser;

    switch (action.type) {
      case "create":
        return Response.json(
          { intake: await createIntake(access, action.intake) },
          { status: 201 },
        );
      case "update":
        return Response.json({
          intake: await updateIntake(access, action.intakeId, action.intake),
        });
      case "status":
        return Response.json({
          intake: await setIntakeStatus(access, action.intakeId, action.status),
        });
      default:
        return Response.json(
          { error: "That is not something this screen can do." },
          { status: 400 },
        );
    }
  } catch (error) {
    return intakeErrorResponse(error);
  }
}

async function requireSchoolUser() {
  const user = await getAuthenticatedUser();
  if (!user) throw new RequestIdentityError();
  return resolveAuthenticatedSchoolUser(user, [
    "school-admin",
    "admissions-officer",
  ]);
}

function intakeErrorResponse(error: unknown) {
  if (error instanceof RequestIdentityError) {
    return Response.json({ error: error.message }, { status: 401 });
  }
  if (error instanceof AuthorizationError) {
    return Response.json({ error: error.message }, { status: 403 });
  }
  if (error instanceof SchoolStructureError) {
    return Response.json({ error: error.message }, { status: 422 });
  }
  const message =
    error instanceof Error ? error.message : "Unable to change the intake.";
  const status = /duplicate key|unique constraint/i.test(message) ? 409 : 400;
  return Response.json({ error: message }, { status });
}

class RequestIdentityError extends Error {
  constructor() {
    super("Sign in is required to access school records.");
    this.name = "RequestIdentityError";
  }
}
