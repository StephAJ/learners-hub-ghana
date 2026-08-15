import { getPostgresPool } from "../../../db/postgres";
import { ensurePlatformReady } from "../../../server/platform-ready";
import { scannerConfigured } from "../../../server/content-scan";
import { mailIsConfigured } from "../../../server/mail/transport";
import { demoSchoolEnabled } from "../../../server/demo-school";

/* ==========================================================================
   Is this deployment fit to run a school

   The database check answers "is it up". The three flags answer "is it
   configured", which is the question that actually bites: a school whose
   uploads are unscanned, whose mail never sends, or which is still carrying
   the demo cast should be able to find that out without reading env files on
   the server.

   None of them makes the service unhealthy. A school with no virus scanner is
   running with a gap it should know about, not an outage.
   ========================================================================== */

export async function GET() {
  try {
    await ensurePlatformReady();
    await getPostgresPool().query("SELECT 1");
    return Response.json({
      database: "connected",
      demoSchool: demoSchoolEnabled(),
      mail: mailIsConfigured() ? "configured" : "not configured",
      service: "learners-hub-web",
      status: "healthy",
      uploadScanning: scannerConfigured() ? "configured" : "not configured",
    });
  } catch (error) {
    console.error("Learners Hub readiness failed.", error);
    return Response.json(
      {
        error: "Database readiness failed.",
        service: "learners-hub-web",
        status: "unhealthy",
      },
      { status: 503 },
    );
  }
}
