export async function GET() {
  return Response.json({
    service: "learners-hub-web",
    status: "healthy",
  });
}
