import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "../../../../server/auth-config";
import { ensurePlatformReady } from "../../../../server/platform-ready";

const handler = toNextJsHandler(auth);

export async function GET(request: Request) {
  await ensurePlatformReady();
  return handler.GET(request);
}

export async function POST(request: Request) {
  await ensurePlatformReady();
  return handler.POST(request);
}
