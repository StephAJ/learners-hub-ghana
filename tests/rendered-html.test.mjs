import assert from "node:assert/strict";
import test from "node:test";

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${path}`, {
      headers: { accept: "text/html" },
      redirect: "manual",
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

test("server-renders one clear public landing page", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Learners Hub<\/title>/i);
  assert.match(html, /Every school day, clearly connected/);
  assert.match(html, /Apply for admission/);
  assert.match(html, /One sign-in opens the right workspace/);
  assert.match(html, /School leaders/);
  assert.match(html, /Teachers/);
  assert.match(html, /Students/);
  assert.match(html, /Families/);
  assert.doesNotMatch(html, /Good afternoon, Kwame/);
  assert.doesNotMatch(html, /School admin|Admin workspace/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
});

test("server-renders the public admissions journey", async () => {
  const response = await render("/admissions");
  assert.equal(response.status, 200);

  const html = await response.text();
  assert.match(html, /Your child’s next chapter starts with a clear application/);
  assert.match(html, /What you will need/);
  assert.match(html, /Start an application/);
  assert.match(html, /Birth certificate/);
  assert.match(html, /Most recent school report/);
});

test("redirects workspace entry to sign-in for anonymous visitors", async () => {
  for (const path of [
    "/app",
    "/admin",
    "/admin/admissions",
    "/admin/people",
    "/admin/academic",
    "/teacher",
    "/teacher/subjects",
    "/teacher/content",
    "/teacher/assessments",
    "/teacher/gradebook",
    "/teacher/operations",
    "/student",
    "/learn/school-day",
    "/guardian",
    "/guardian/reports",
    "/guardian/school-day",
    "/applicant",
    "/admissions/apply",
  ]) {
    const response = await render(path);
    assert.ok(
      [302, 303, 307, 308].includes(response.status),
      `${path} should redirect, received ${response.status}`,
    );
    assert.match(
      response.headers.get("location") ?? "",
      /\/signin-with-chatgpt/,
      `${path} should redirect to sign-in`,
    );
  }
});

test("protects persistent school-record APIs from anonymous requests", async () => {
  for (const path of [
    "/api/admin/admissions",
    "/api/admin/people",
    "/api/admissions/application",
    "/api/teacher/lessons",
    "/api/teacher/content",
    "/api/content/media?assetId=missing",
    "/api/learn/interactions?activityId=missing&lessonId=missing&lessonVersion=1",
    "/api/learn/subjects",
    "/api/teacher/assessments",
    "/api/learn/assessments",
    "/api/teacher/gradebook",
    "/api/guardian/reports",
    "/api/teacher/operations",
    "/api/learn/school-day",
    "/api/guardian/school-day",
  ]) {
    const response = await render(path);
    assert.equal(response.status, 401, path);

    const payload = await response.json();
    assert.match(payload.error, /Sign in is required/);
  }
});
