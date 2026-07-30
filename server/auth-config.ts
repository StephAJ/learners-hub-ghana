import { betterAuth } from "better-auth";
import { getPostgresPool } from "../db/postgres";

const configuredOrigin =
  process.env.BETTER_AUTH_URL ?? process.env.LEARNERS_HUB_ORIGIN;

export const auth = betterAuth({
  appName: "Learners Hub",
  baseURL: configuredOrigin,
  database: getPostgresPool(),
  emailAndPassword: {
    autoSignIn: true,
    enabled: true,
    maxPasswordLength: 128,
    minPasswordLength: 10,
  },
  rateLimit: {
    enabled: true,
    max: 100,
    window: 60,
  },
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins: configuredOrigin
    ? [configuredOrigin]
    : ["http://localhost:3000"],
  advanced: {
    cookiePrefix: "learners-hub",
    trustedProxyHeaders: true,
  },
});
