import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import type { Express } from "express";
import { createServer } from "../src/server.js";

describe("runtime HTTP server", () => {
  it("reports health and protects import and player routes", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "lh-h5p-server-"));
    const coreDirectory = path.join(directory, "core");
    await mkdir(path.join(coreDirectory, "js"), { recursive: true });
    await writeFile(path.join(coreDirectory, "js", "h5p.js"), "");
    const app = await createServer({
      coreDirectory,
      dataDirectory: path.join(directory, "data"),
      maxPackageBytes: 25 * 1024 * 1024,
      parentOrigin: "https://school.example",
      port: 0,
      sharedSecret: "a-secure-runtime-secret-with-enough-entropy",
    });
    const server = await listen(app);

    try {
      const origin = serverOrigin(server);
      const health = await fetch(`${origin}/health`);
      const importResponse = await fetch(`${origin}/v1/packages`, {
        body: Buffer.from("not authenticated"),
        headers: { "content-type": "application/x-h5p" },
        method: "POST",
      });
      const playerResponse = await fetch(
        `${origin}/v1/player/content-1?grant=invalid`,
      );

      assert.equal(health.status, 200);
      assert.deepEqual(await health.json(), {
        service: "learners-hub-h5p",
        status: "healthy",
      });
      assert.equal(importResponse.status, 401);
      assert.equal(playerResponse.status, 401);
    } finally {
      await close(server);
    }
  });
});

function listen(app: Express) {
  return new Promise<Server>((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function serverOrigin(server: Server) {
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

function close(server: Server) {
  return new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}
