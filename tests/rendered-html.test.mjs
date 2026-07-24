import assert from "node:assert/strict";
import test from "node:test";

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${path}`, {
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

test("server-renders the academic administration workspace", async () => {
  const response = await render("/admin/academic");
  assert.equal(response.status, 200);

  const html = await response.text();
  assert.match(html, /Academic structure/);
  assert.match(html, /Class subject policy/);
  assert.match(html, /Compulsory subjects/);
  assert.match(html, /Optional subjects/);
  assert.match(html, /Place a learner/);
  assert.match(html, /Class-first access rule/);
});

test("server-renders the admissions and student-records workspace", async () => {
  const response = await render("/admin/admissions");
  assert.equal(response.status, 200);

  const html = await response.text();
  assert.match(html, /2026 \/ 2027 intake/);
  assert.match(html, /Application queue/);
  assert.match(html, /Active applicants/);
  assert.match(html, /Make offer/);
  assert.match(html, /Ama Ofori/);
});

test("server-renders the people and access workspace", async () => {
  const response = await render("/admin/people");
  assert.equal(response.status, 200);

  const html = await response.text();
  assert.match(html, /People &amp; access/);
  assert.match(html, /Identity &amp; permissions/);
  assert.match(html, /School directory/);
  assert.match(html, /Effective permissions/);
  assert.match(html, /Invite a member/);
});

test("server-renders the teacher lesson workspace", async () => {
  const response = await render("/teacher/subjects");
  assert.equal(response.status, 200);

  const html = await response.text();
  assert.match(html, /Integrated Science/);
  assert.match(html, /Lesson library/);
  assert.match(html, /New lesson draft/);
  assert.match(html, /The human digestive system/);
  assert.match(html, /How breathing powers the body/);
  assert.match(html, /Curriculum standards/);
  assert.match(html, /Release to learners/);
  assert.match(html, /Learner preview/);
});

test("server-renders the learner lesson player", async () => {
  const response = await render("/learn/subjects/integrated-science");
  assert.equal(response.status, 200);

  const html = await response.text();
  assert.match(html, /The human digestive system/);
  assert.match(html, /Learning objectives/);
  assert.match(html, /Your body.?s food-processing journey/);
  assert.match(html, /How breathing powers the body/);
  assert.match(html, /Complete .*The human digestive system.* first/);
  assert.match(html, /Continue/);
});

test("server-renders the teacher assessment workspace", async () => {
  const response = await render("/teacher/assessments");
  assert.equal(response.status, 200);

  const html = await response.text();
  assert.match(html, /Build, deliver and review with confidence/);
  assert.match(html, /Question bank/);
  assert.match(html, /Where does most nutrient absorption take place/);
  assert.match(html, /Review queue/);
  assert.match(html, /New question/);
});

test("server-renders the learner assessment centre", async () => {
  const response = await render(
    "/learn/assessments/digestive-system-check",
  );
  assert.equal(response.status, 200);

  const html = await response.text();
  assert.match(html, /Digestive system knowledge check/);
  assert.match(html, /Formative knowledge check/);
  assert.match(html, /Before you begin/);
  assert.match(html, /Start assessment/);
  assert.match(html, /12/);
});

test("server-renders the teacher gradebook and report workflow", async () => {
  const response = await render("/teacher/gradebook");
  assert.equal(response.status, 200);

  const html = await response.text();
  assert.match(html, /Gradebook &amp; reports/);
  assert.match(html, /Every final grade stays explainable/);
  assert.match(html, /Subject marks/);
  assert.match(html, /Integrated Science(?:<!-- -->)? marks/);
  assert.match(html, /Missing marks/);
  assert.match(html, /Report workflow/);
});

test("server-renders the guardian released-report workspace", async () => {
  const response = await render("/guardian/reports");
  assert.equal(response.status, 200);

  const html = await response.text();
  assert.match(
    html,
    /Your child(?:&#x27;|')s progress, clearly explained/,
  );
  assert.match(html, /Relationship-protected/);
  assert.match(html, /End-of-term academic report/);
  assert.match(html, /Kwame Agyeman/);
  assert.match(html, /Subject results/);
  assert.match(html, /Only reports approved and released/);
});

test("server-renders the teacher daily-operations workspace", async () => {
  const response = await render("/teacher/operations");
  assert.equal(response.status, 200);

  const html = await response.text();
  assert.match(html, /Run the school day from one dependable view/);
  assert.match(html, /Assignments &amp; rubrics/);
  assert.match(html, /Attendance/);
  assert.match(html, /Timetable/);
  assert.match(html, /Today at a glance/);
  assert.match(html, /Marking queue/);
});

test("server-renders the learner school-day workspace", async () => {
  const response = await render("/learn/school-day");
  assert.equal(response.status, 200);

  const html = await response.text();
  assert.match(html, /Your school day, all in one place/);
  assert.match(html, /Today(?:&#x27;|')s timetable/);
  assert.match(html, /My assignments/);
  assert.match(html, /Body systems model/);
  assert.match(html, /Attendance this week/);
});

test("server-renders the guardian school-day workspace", async () => {
  const response = await render("/guardian/school-day");
  assert.equal(response.status, 200);

  const html = await response.text();
  assert.match(html, /Know what happened at school today/);
  assert.match(html, /Attendance alerts/);
  assert.match(html, /Kwame was marked absent/);
  assert.match(html, /Due assignments/);
  assert.match(html, /Relationship-protected updates/);
});

test("protects persistent school-record APIs from anonymous requests", async () => {
  for (const path of [
    "/api/admin/people",
    "/api/teacher/lessons",
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
    assert.equal(response.status, 401);

    const payload = await response.json();
    assert.match(payload.error, /Sign in is required/);
  }
});
