import assert from "node:assert/strict";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the Learners Hub student dashboard", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Learners Hub<\/title>/i);
  assert.match(html, /Good afternoon, Kwame/);
  assert.match(html, /JHS 2 Gold/);
  assert.match(html, /My subjects/);
  assert.match(html, /Integrated Science/);
  assert.match(html, /Upcoming work/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
});

test("renders all compulsory subject cards", async () => {
  const response = await render();
  const html = await response.text();

  for (const subject of [
    "Mathematics",
    "English Language",
    "Integrated Science",
    "Social Studies",
    "Computing",
    "Religious &amp; Moral Education",
  ]) {
    assert.match(html, new RegExp(subject));
  }
});
