"use client";

import { createAuthClient } from "better-auth/react";
import { twoFactorClient } from "better-auth/client/plugins";

/* The two-factor plugin has to be declared on both sides. Without it here,
   authClient.twoFactor is undefined at runtime while the server endpoints
   exist — which fails as a missing property rather than as a 404, and reads
   like the feature was never built. */
export const authClient = createAuthClient({
  plugins: [twoFactorClient()],
});
