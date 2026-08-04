import { createFilesystemMediaStore, type MediaStore } from "./media-storage";
import { getPostgresPool } from "./postgres";
import { createSchoolDatabase, type SchoolDatabase } from "./school-database";

/* ==========================================================================
   Backing services

   Learners Hub runs on a Node server with PostgreSQL and a mounted volume.
   Both handles were once Cloudflare bindings — D1 and R2 — and the interfaces
   still have the shape those APIs gave them, because the five learning
   repositories are written against it. The bindings themselves are gone.
   ========================================================================== */

let database: SchoolDatabase | undefined;

/**
 * The school database. Shared by every repository.
 *
 * This used to refuse unless `process.env.DATABASE_URL` was set, and that
 * check was wrong in a way that took out half the product on the VPS.
 *
 * `deploy/hostinger/docker-compose.yml` configures the web container the way
 * PostgreSQL tooling normally is — `PGHOST`, `PGUSER`, `PGPASSWORD`,
 * `PGDATABASE`, `PGPORT` — and never sets `DATABASE_URL`. node-postgres reads
 * those variables itself when it is given no connection string, so
 * `getPostgresPool()` connected perfectly well and sign-in, people,
 * admissions and the admin screens all worked.
 *
 * Everything behind this function did not. The five learning repositories —
 * messaging, content, assessment, operations and reporting — all reach the
 * database through here, so on the VPS every one of them threw
 * "DATABASE_URL is not set" against a database that was connected and
 * healthy. `/api/health` reported healthy throughout, because it asks the
 * pool rather than this.
 *
 * There is no configuration test here any more. The pool is the single
 * authority on whether a database is reachable, and a genuine connection
 * failure surfaces as a connection error, which says something true.
 */
export async function getSchoolDatabase(): Promise<SchoolDatabase> {
  database ??= createSchoolDatabase(getPostgresPool());
  return database;
}

let mediaStore: MediaStore | undefined;

/** Where uploaded lesson media lives. */
export async function getMediaStore(): Promise<MediaStore> {
  const directory = process.env.MEDIA_STORAGE_DIR;
  if (!directory) {
    throw new Error(
      "MEDIA_STORAGE_DIR is not set, so uploaded media has nowhere to live.",
    );
  }
  mediaStore ??= createFilesystemMediaStore(directory);
  return mediaStore;
}
