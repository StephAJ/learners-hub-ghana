import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    /* tests/integration needs PostgreSQL running; it has a config of its own so
       this suite stays runnable with nothing but node. */
    exclude: ["tests/integration/**"],
    include: ["tests/**/*.test.ts"],
  },
});
