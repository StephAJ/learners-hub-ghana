import { getPostgresPool } from "../../../db/postgres";
import { ensurePlatformReady } from "../../../server/platform-ready";

export async function GET() {
  try {
    await ensurePlatformReady();
    await getPostgresPool().query("SELECT 1");
    return Response.json({
      database: "connected",
      service: "learners-hub-web",
      status: "healthy",
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
