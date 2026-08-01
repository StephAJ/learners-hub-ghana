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

/** The school database. Shared by every repository. */
export async function getSchoolDatabase(): Promise<SchoolDatabase> {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is not set, so there is no database to read from.",
    );
  }
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
