import { describe, expect, it } from "vitest";
import { getH5pRuntimeConfig } from "../server/h5p-runtime";

const sharedSecret = "a-secure-runtime-secret-with-enough-entropy";

describe("H5P runtime environment", () => {
  it("reads the runtime connection from the environment", async () => {
    const config = await getH5pRuntimeConfig({
      H5P_RUNTIME_BASE_URL: "https://h5p.example-school.com",
      H5P_RUNTIME_SHARED_SECRET: sharedSecret,
    });

    expect(config).toEqual({
      baseUrl: "https://h5p.example-school.com",
      sharedSecret,
    });
  });

  it("refuses to run with the runtime unconfigured", async () => {
    /* Falling back to an unauthenticated or default runtime would send school
       content to somewhere nobody chose. */
    await expect(getH5pRuntimeConfig({})).rejects.toThrow(
      /not connected yet/,
    );
  });
});
