import { pointAtTestDatabase } from "./harness";

/* Runs before any test module is imported, which is what matters: the pool in
   db/postgres.ts reads DATABASE_URL on first use and caches itself on
   globalThis, so pointing it at the test database has to happen before the
   first repository import rather than inside a test body. */
pointAtTestDatabase();
