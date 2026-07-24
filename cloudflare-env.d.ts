export {};

declare global {
  namespace Cloudflare {
    interface Env {
      DB: D1Database;
      H5P_RUNTIME_BASE_URL?: string;
      H5P_RUNTIME_SHARED_SECRET?: string;
      MEDIA: R2Bucket;
    }
  }
}
