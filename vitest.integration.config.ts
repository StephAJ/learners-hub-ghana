import { defineConfig } from "vitest/config";

/* ==========================================================================
   Tests that need a database

   Separate from vitest.config.ts because these need PostgreSQL running and the
   domain tests deliberately do not. `npm test` runs both; `npm run test:domain`
   stays fast and dependency-free for the inner loop.

   Single-threaded and single-file-at-a-time: the tests truncate shared tables
   between cases, and two files doing that concurrently would delete each
   other's fixtures.
   ========================================================================== */

export default defineConfig({
  test: {
    environment: "node",
    fileParallelism: false,
    include: ["tests/integration/**/*.test.ts"],
    /* Migrations run once on the first ensurePlatformReady(), and better-auth's
       own migration step is not fast. */
    hookTimeout: 60_000,
    setupFiles: ["tests/integration/setup.ts"],
    testTimeout: 30_000,
  },
});
