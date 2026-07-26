import { describe, expect, it } from "vitest";
import { getH5pRuntimeConfig } from "../server/h5p-runtime";

const sharedSecret = "a-secure-runtime-secret-with-enough-entropy";

describe("H5P runtime environment", () => {
  it("uses standard Node environment variables in the VPS runtime", async () => {
    const config = await getH5pRuntimeConfig(
      {
        H5P_RUNTIME_BASE_URL: "https://h5p.example-school.com",
        H5P_RUNTIME_SHARED_SECRET: sharedSecret,
      },
      async () => {
        throw new Error("Cloudflare bindings are unavailable");
      },
    );

    expect(config).toEqual({
      baseUrl: "https://h5p.example-school.com",
      sharedSecret,
    });
  });

  it("retains Cloudflare binding support for the existing deployment", async () => {
    const config = await getH5pRuntimeConfig({}, async () => ({
      H5P_RUNTIME_BASE_URL: "https://h5p.example-school.com",
      H5P_RUNTIME_SHARED_SECRET: sharedSecret,
    }));

    expect(config.baseUrl).toBe("https://h5p.example-school.com");
  });
});
