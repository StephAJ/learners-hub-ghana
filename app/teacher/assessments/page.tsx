"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import type {
  QuestionBankSummary,
  ReviewAttempt,
  TeacherAssessmentWorkspace,
} from "../../../db/assessment-repository";
import type {
  AssessmentPurpose,
  QuestionType,
} from "../../../domain/assessment/types";
import "../../admin/academic/academic.css";
import "./teacher-assessments.css";

const navigation = [
  { href: "/teacher", label: "Today", symbol: "⌂" },
  { href: "/teacher/subjects", label: "My subjects", symbol: "▦" },
  { href: "/teacher/subjects", label: "Lessons", symbol: "≡" },
  { href: "/teacher/assessments", label: "Assessments", symbol: "✓" },
  { href: "/teacher/gradebook", label: "Markbook", symbol: "↗" },
  { href: "#classes", label: "Class groups", symbol: "◎" },
];

const typeLabels: Record<QuestionType, string> = {
  "single-choice": "Single choice",
  "multiple-choice": "Multiple choice",
  "true-false": "True / false",
  "short-text": "Short text",
  numeric: "Numeric",
  matching: "Matching",
  ordering: "Ordering",
  essay: "Essay",
  "file-upload": "File upload",
  hotspot: "Hotspot",
  composite: "Composite",
};

const previewWorkspace: TeacherAssessmentWorkspace = {
  assessments: [
    {
      attemptCount: 1,
      id: "assessment-digestion-check",
      purpose: "formative",
      questionCount: 5,
      status: "published",
      timeLimitMinutes: 12,
      title: "Digestive system knowledge check",
      totalMarks: 9,
      version: 1,
    },
    {
      attemptCount: 0,
      id: "assessment-nutrition-exit-ticket",
      purpose: "formative",
      questionCount: 1,
      status: "draft",
      timeLimitMinutes: 8,
      title: "Balanced diet exit ticket",
      totalMarks: 1,
      version: 0,
    },
  ],
  bank: [
    question(
      "question-absorption-site",
      "Where does most nutrient absorption take place?",
      "single-choice",
      1,
      "foundation",
      1,
    ),
    question(
      "question-bile-true-false",
      "Bile helps the body digest fats.",
      "true-false",
      1,
      "foundation",
      2,
    ),
    question(
      "question-organ-action-match",
      "Match each digestive organ to its main action.",
      "matching",
      2,
      "standard",
      1,
    ),
    question(
      "question-digestion-order",
      "Arrange the organs in the order food travels through them.",
      "ordering",
      2,
      "standard",
      1,
    ),
    question(
      "question-villi-explanation",
      "Explain two ways the small intestine is adapted for absorption.",
      "essay",
      3,
      "challenge",
      1,
    ),
    question(
      "question-nutrients-multiple",
      "Select the two nutrient groups associated with growth and protection.",
      "multiple-choice",
      2,
      "standard",
      0,
    ),
    question(
      "question-saliva-short-text",
      "Name the enzyme in saliva that begins starch digestion.",
      "short-text",
      1,
      "standard",
      0,
    ),
    question(
      "question-adult-teeth-numeric",
      "How many permanent teeth does a typical adult have?",
      "numeric",
      1,
      "foundation",
      0,
    ),
    question(
      "question-digestion-file",
      "Submit a clearly labelled digestive-system diagram.",
      "file-upload",
      4,
      "challenge",
      0,
    ),
    question(
      "question-stomach-hotspot",
      "Select the area where the stomach is located.",
      "hotspot",
      1,
      "standard",
      0,
    ),
    question(
      "question-meal-composite",
      "Read the meal scenario and recommend one improvement.",
      "composite",
      4,
      "challenge",
      0,
    ),
  ],
  className: "JHS 2 Gold",
  code: "IS",
  offeringId: "offering-science-jhs2",
  reviewQueue: [
    {
      attemptId: "attempt-kwame-digestion",
      learnerName: "Kwame Agyeman",
      maximumMarks: 9,
      response: {
        maximumMarks: 3,
        prompt:
          "Explain two ways the small intestine is adapted for nutrient absorption.",
        questionVersionId: "question-villi-explanation:v1",
        responseText:
          "The small intestine has many villi, so digested food has more surface to pass into the blood.",
      },
      score: 1,
      status: "needs-marking",
      submittedAt: "2026-07-23T08:19:00Z",
      title: "Digestive system knowledge check",
    },
  ],
  subjectName: "Integrated Science",
  typeCoverage: 11,
};

type WorkspaceTab = "bank" | "quizzes" | "review";

export default function TeacherAssessmentsPage() {
  const [workspace, setWorkspace] = useState(previewWorkspace);
  const [actor, setActor] = useState("Grace Mensah");
  const [tab, setTab] = useState<WorkspaceTab>("bank");
  const [dataMode, setDataMode] = useState<"loading" | "protected" | "preview">(
    "loading",
  );
  const [notice, setNotice] = useState("");
  const [showQuestionForm, setShowQuestionForm] = useState(false);
  const [typeFilter, setTypeFilter] = useState<QuestionType | "all">("all");

  useEffect(() => {
    let active = true;
    async function loadWorkspace() {
      try {
        const response = await fetch("/api/teacher/assessments");
        if (!response.ok) throw new Error("Assessment records unavailable.");
        const payload = (await response.json()) as {
          actor: string;
          workspace: TeacherAssessmentWorkspace;
        };
        if (!active) return;
        setActor(payload.actor);
        setWorkspace(payload.workspace);
        setDataMode("protected");
      } catch {
        if (active) setDataMode("preview");
      }
    }
    void loadWorkspace();
    return () => {
      active = false;
    };
  }, []);

  const visibleQuestions = useMemo(
    () =>
      typeFilter === "all"
        ? workspace.bank
        : workspace.bank.filter((item) => item.type === typeFilter),
    [typeFilter, workspace.bank],
  );
  const needsMarking = workspace.reviewQueue.filter(
    (attempt) => attempt.status === "needs-marking",
  ).length;

  async function createQuestion(input: CreateQuestionFormInput) {
    if (dataMode !== "protected") {
      const previewQuestion: QuestionBankSummary = {
        difficulty: input.difficulty,
        id: `preview-${Date.now()}`,
        marks: input.marks,
        prompt: input.prompt,
        status: "approved",
        topic: input.topic,
        type: input.type,
        usageCount: 0,
        version: 1,
      };
      setWorkspace((current) => ({
        ...current,
        bank: [previewQuestion, ...current.bank],
      }));
      setNotice("Question added to this preview.");
      setShowQuestionForm(false);
      return;
    }
    const response = await fetch("/api/teacher/assessments", {
      body: JSON.stringify({ action: "create-question", ...input }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const payload = (await response.json()) as {
      error?: string;
      question?: QuestionBankSummary;
    };
    if (!response.ok || !payload.question) {
      setNotice(payload.error ?? "Question could not be created.");
      return;
    }
    setWorkspace((current) => ({
      ...current,
      bank: [payload.question as QuestionBankSummary, ...current.bank],
    }));
    setNotice("Question approved and added to the bank.");
    setShowQuestionForm(false);
  }

  async function publishQuiz(assessmentId: string) {
    if (dataMode !== "protected") {
      setWorkspace((current) => ({
        ...current,
        assessments: current.assessments.map((assessment) =>
          assessment.id === assessmentId
            ? { ...assessment, status: "published", version: 1 }
            : assessment,
        ),
      }));
      setNotice("Quiz published in this preview.");
      return;
    }
    const response = await fetch("/api/teacher/assessments", {
      body: JSON.stringify({ action: "publish", assessmentId }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const payload = (await response.json()) as {
      assessment?: TeacherAssessmentWorkspace["assessments"][number];
      error?: string;
    };
    if (!response.ok || !payload.assessment) {
      setNotice(payload.error ?? "Quiz could not be published.");
      return;
    }
    setWorkspace((current) => ({
      ...current,
      assessments: current.assessments.map((assessment) =>
        assessment.id === assessmentId
          ? payload.assessment!
          : assessment,
      ),
    }));
    setNotice("Quiz published. Learners can now start it.");
  }

  async function createQuiz(input: CreateQuizFormInput) {
    if (dataMode !== "protected") {
      setWorkspace((current) => ({
        ...current,
        assessments: [
          {
            attemptCount: 0,
            id: `preview-quiz-${Date.now()}`,
            purpose: input.purpose,
            questionCount: input.questionIds.length,
            status: "draft",
            timeLimitMinutes: input.timeLimitMinutes,
            title: input.title,
            totalMarks: current.bank
              .filter((question) => input.questionIds.includes(question.id))
              .reduce((sum, question) => sum + question.marks, 0),
            version: 0,
          },
          ...current.assessments,
        ],
      }));
      setNotice("Quiz draft assembled in this preview.");
      return;
    }
    const response = await fetch("/api/teacher/assessments", {
      body: JSON.stringify({ action: "create-assessment", ...input }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const payload = (await response.json()) as {
      assessment?: TeacherAssessmentWorkspace["assessments"][number];
      error?: string;
    };
    if (!response.ok || !payload.assessment) {
      setNotice(payload.error ?? "Quiz draft could not be assembled.");
      return;
    }
    setWorkspace((current) => ({
      ...current,
      assessments: [payload.assessment!, ...current.assessments],
    }));
    setNotice("Quiz draft assembled from pinned question versions.");
  }

  async function updateReviewQueue(
    action:
      | {
          action: "mark";
          attemptId: string;
          feedback: string;
          marks: number;
          questionVersionId: string;
        }
      | { action: "release"; attemptId: string },
  ) {
    if (dataMode !== "protected") {
      setWorkspace((current) => ({
        ...current,
        reviewQueue: current.reviewQueue.map((attempt) =>
          attempt.attemptId === action.attemptId
            ? {
                ...attempt,
                response:
                  action.action === "mark" ? undefined : attempt.response,
                score:
                  action.action === "mark"
                    ? attempt.score + action.marks
                    : attempt.score,
                status: action.action === "mark" ? "marked" : "released",
              }
            : attempt,
        ),
      }));
      setNotice(
        action.action === "mark"
          ? "Response marked in this preview."
          : "Result released in this preview.",
      );
      return;
    }
    const response = await fetch("/api/teacher/assessments", {
      body: JSON.stringify(action),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const payload = (await response.json()) as {
      error?: string;
      reviewQueue?: ReviewAttempt[];
    };
    if (!response.ok || !payload.reviewQueue) {
      setNotice(payload.error ?? "Review action could not be completed.");
      return;
    }
    setWorkspace((current) => ({
      ...current,
      reviewQueue: payload.reviewQueue as ReviewAttempt[],
    }));
    setNotice(
      action.action === "mark"
        ? "Response marked and score recalculated."
        : "Result released to the learner.",
    );
  }

  return (
    <main className="assessment-shell">
      <aside className="academic-sidebar assessment-sidebar">
        <Link className="academic-brand" href="/teacher">
          <span className="academic-brand-mark">LH</span>
          <span>
            <strong>Learners Hub</strong>
            <small>Teacher workspace</small>
          </span>
        </Link>
        <nav aria-label="Teacher navigation">
          {navigation.map((item) => (
            <Link
              className={
                item.href === "/teacher/assessments" ? "is-active" : ""
              }
              href={item.href}
              key={item.label}
            >
              <span>{item.symbol}</span>
              {item.label}
              {item.label === "Assessments" && needsMarking > 0 ? (
                <b>{needsMarking}</b>
              ) : null}
            </Link>
          ))}
        </nav>
        <div className="assessment-sidebar-note">
          <span>Question bank health</span>
          <strong>{workspace.typeCoverage} item types in use</strong>
          <small>Build breadth before the term test.</small>
        </div>
      </aside>

      <section className="assessment-main">
        <header className="assessment-topbar">
          <div>
            <p>Teaching / {workspace.subjectName}</p>
            <h1>Assessments</h1>
          </div>
          <div className="assessment-account">
            <span className={`data-pulse ${dataMode}`} />
            <div>
              <strong>{actor}</strong>
              <small>
                {dataMode === "protected"
                  ? "School records connected"
                  : dataMode === "loading"
                    ? "Connecting records"
                    : "Preview workspace"}
              </small>
            </div>
            <span className="assessment-avatar">
              {initials(actor)}
            </span>
          </div>
        </header>

        <div className="assessment-content">
          <section className="assessment-hero">
            <div>
              <span className="subject-code">{workspace.code}</span>
              <p>{workspace.className}</p>
              <h2>Build, deliver and review with confidence.</h2>
              <p>
                Reuse approved questions, pin exact versions, and keep
                automatic and teacher-awarded marks clearly separated.
              </p>
            </div>
            <button
              className="learner-preview-link"
              onClick={() =>
                setNotice(
                  "Learner preview will open in a clearly labelled preview session.",
                )
              }
              type="button"
            >
              Preview assessment
            </button>
          </section>

          {notice ? (
            <button
              className="assessment-notice"
              onClick={() => setNotice("")}
              type="button"
            >
              {notice} <span>×</span>
            </button>
          ) : null}

          <section className="assessment-metrics" aria-label="Assessment summary">
            <article>
              <span>Question bank</span>
              <strong>{workspace.bank.length}</strong>
              <small>{workspace.typeCoverage} item types</small>
            </article>
            <article>
              <span>Published quizzes</span>
              <strong>
                {
                  workspace.assessments.filter(
                    (assessment) => assessment.status === "published",
                  ).length
                }
              </strong>
              <small>Ready for learners</small>
            </article>
            <article>
              <span>Awaiting marking</span>
              <strong>{needsMarking}</strong>
              <small>Constructed response</small>
            </article>
            <article>
              <span>Attempts</span>
              <strong>
                {workspace.assessments.reduce(
                  (sum, assessment) => sum + assessment.attemptCount,
                  0,
                )}
              </strong>
              <small>Current versions</small>
            </article>
          </section>

          <div className="assessment-tabs" role="tablist">
            {[
              ["bank", "Question bank"],
              ["quizzes", "Quizzes"],
              ["review", `Review queue · ${needsMarking}`],
            ].map(([id, label]) => (
              <button
                aria-selected={tab === id}
                className={tab === id ? "is-active" : ""}
                key={id}
                onClick={() => setTab(id as WorkspaceTab)}
                role="tab"
                type="button"
              >
                {label}
              </button>
            ))}
          </div>

          {tab === "bank" ? (
            <QuestionBankPanel
              createQuestion={createQuestion}
              questions={visibleQuestions}
              setShowForm={setShowQuestionForm}
              setTypeFilter={setTypeFilter}
              showForm={showQuestionForm}
              typeFilter={typeFilter}
            />
          ) : null}
          {tab === "quizzes" ? (
            <QuizPanel
              assessments={workspace.assessments}
              bank={workspace.bank}
              createQuiz={createQuiz}
              publishQuiz={publishQuiz}
            />
          ) : null}
          {tab === "review" ? (
            <ReviewPanel
              attempts={workspace.reviewQueue}
              updateQueue={updateReviewQueue}
            />
          ) : null}
        </div>
      </section>
    </main>
  );
}

function QuestionBankPanel({
  createQuestion,
  questions,
  setShowForm,
  setTypeFilter,
  showForm,
  typeFilter,
}: {
  createQuestion: (input: CreateQuestionFormInput) => Promise<void>;
  questions: QuestionBankSummary[];
  setShowForm: (value: boolean) => void;
  setTypeFilter: (value: QuestionType | "all") => void;
  showForm: boolean;
  typeFilter: QuestionType | "all";
}) {
  return (
    <section className="assessment-panel">
      <div className="panel-heading">
        <div>
          <p>Reusable content</p>
          <h2>Question bank</h2>
        </div>
        <button
          className="primary-assessment-button"
          onClick={() => setShowForm(!showForm)}
          type="button"
        >
          {showForm ? "Close form" : "+ New question"}
        </button>
      </div>

      {showForm ? <QuestionForm onSubmit={createQuestion} /> : null}

      <div className="question-filter-row">
        <label htmlFor="question-type-filter">Filter by item type</label>
        <select
          id="question-type-filter"
          onChange={(event) =>
            setTypeFilter(event.target.value as QuestionType | "all")
          }
          value={typeFilter}
        >
          <option value="all">All question types</option>
          {Object.entries(typeLabels).map(([type, label]) => (
            <option key={type} value={type}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div className="question-bank-list">
        {questions.map((item) => (
          <article className="question-bank-card" key={item.id}>
            <span className={`question-type-icon ${item.type}`}>
              {questionSymbol(item.type)}
            </span>
            <div className="question-card-copy">
              <div>
                <span className="question-type-label">
                  {typeLabels[item.type]}
                </span>
                <span className={`difficulty-tag ${item.difficulty}`}>
                  {item.difficulty}
                </span>
              </div>
              <h3>{item.prompt}</h3>
              <p>
                {item.topic} · Version {item.version} · Used in{" "}
                {item.usageCount}{" "}
                {item.usageCount === 1 ? "quiz" : "quizzes"}
              </p>
            </div>
            <div className="question-marks">
              <strong>{item.marks}</strong>
              <span>{item.marks === 1 ? "mark" : "marks"}</span>
              <small>{item.status}</small>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function QuizPanel({
  assessments,
  bank,
  createQuiz,
  publishQuiz,
}: {
  assessments: TeacherAssessmentWorkspace["assessments"];
  bank: QuestionBankSummary[];
  createQuiz: (input: CreateQuizFormInput) => Promise<void>;
  publishQuiz: (assessmentId: string) => Promise<void>;
}) {
  const [showForm, setShowForm] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await createQuiz({
      instructions: String(form.get("instructions") ?? ""),
      passMarkPercent: Number(form.get("passMarkPercent") ?? 50),
      purpose: String(
        form.get("purpose") ?? "formative",
      ) as AssessmentPurpose,
      questionIds: form.getAll("questionIds").map(String),
      timeLimitMinutes: Number(form.get("timeLimitMinutes") ?? 15),
      title: String(form.get("title") ?? ""),
    });
    setShowForm(false);
  }

  return (
    <section className="assessment-panel">
      <div className="panel-heading">
        <div>
          <p>Delivery</p>
          <h2>Quizzes and checks</h2>
        </div>
        <button
          className="secondary-assessment-button"
          onClick={() => setShowForm(!showForm)}
          type="button"
        >
          {showForm ? "Close builder" : "+ Assemble quiz"}
        </button>
      </div>
      {showForm ? (
        <form className="quiz-builder" onSubmit={submit}>
          <div className="quiz-builder-fields">
            <label>
              Quiz title
              <input
                defaultValue="Food and nutrition practice"
                name="title"
                required
              />
            </label>
            <label>
              Purpose
              <select defaultValue="formative" name="purpose">
                <option value="diagnostic">Diagnostic</option>
                <option value="formative">Formative</option>
                <option value="homework">Homework</option>
                <option value="summative">Summative</option>
                <option value="mock-examination">Mock examination</option>
                <option value="timed-examination">Timed examination</option>
                <option value="survey">Survey</option>
              </select>
            </label>
            <label>
              Time limit
              <span>
                <input
                  defaultValue="15"
                  max="600"
                  min="1"
                  name="timeLimitMinutes"
                  type="number"
                />
                minutes
              </span>
            </label>
            <label>
              Pass mark
              <span>
                <input
                  defaultValue="60"
                  max="100"
                  min="0"
                  name="passMarkPercent"
                  type="number"
                />
                %
              </span>
            </label>
            <label className="wide-field">
              Learner instructions
              <input
                defaultValue="Answer every question and review flagged items before submitting."
                name="instructions"
                required
              />
            </label>
          </div>
          <fieldset>
            <legend>Select approved question versions</legend>
            <div className="builder-question-list">
              {bank.slice(0, 8).map((question, index) => (
                <label key={question.id}>
                  <input
                    defaultChecked={index < 3}
                    disabled={question.type === "file-upload"}
                    name="questionIds"
                    type="checkbox"
                    value={question.id}
                  />
                  <span>
                    <strong>{question.prompt}</strong>
                    <small>
                      {typeLabels[question.type]} · {question.marks} marks · v
                      {question.version}
                      {question.type === "file-upload"
                        ? " · storage activation required"
                        : ""}
                    </small>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="question-form-actions">
            <small>
              The draft will pin the exact question versions selected here.
            </small>
            <button className="primary-assessment-button" type="submit">
              Create quiz draft
            </button>
          </div>
        </form>
      ) : null}
      <div className="quiz-grid">
        {assessments.map((assessment) => (
          <article className="quiz-card" key={assessment.id}>
            <div className="quiz-card-top">
              <span className={`quiz-state ${assessment.status}`}>
                {assessment.status}
              </span>
              <button aria-label="Quiz actions" type="button">
                •••
              </button>
            </div>
            <div className="quiz-icon">✓</div>
            <p>{assessment.purpose.replace("-", " ")}</p>
            <h3>{assessment.title}</h3>
            <div className="quiz-facts">
              <span>{assessment.questionCount} questions</span>
              <span>{assessment.totalMarks} marks</span>
              <span>{assessment.timeLimitMinutes} min</span>
            </div>
            <div className="quiz-card-footer">
              <span>
                <strong>{assessment.attemptCount}</strong> attempts
              </span>
              {assessment.status === "draft" ? (
                <button
                  onClick={() => void publishQuiz(assessment.id)}
                  type="button"
                >
                  Publish quiz
                </button>
              ) : (
                <span>Published</span>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function ReviewPanel({
  attempts,
  updateQueue,
}: {
  attempts: ReviewAttempt[];
  updateQueue: (
    action:
      | {
          action: "mark";
          attemptId: string;
          feedback: string;
          marks: number;
          questionVersionId: string;
        }
      | { action: "release"; attemptId: string },
  ) => Promise<void>;
}) {
  const [marks, setMarks] = useState("2");
  const [feedback, setFeedback] = useState(
    "Good explanation of surface area. Add the rich blood supply for full marks.",
  );

  return (
    <section className="assessment-panel">
      <div className="panel-heading">
        <div>
          <p>Teacher judgement</p>
          <h2>Attempt review</h2>
        </div>
        <span className="review-policy">Results release after marking</span>
      </div>
      <div className="review-list">
        {attempts.map((attempt) => (
          <article className="review-card" key={attempt.attemptId}>
            <header>
              <span className="review-avatar">
                {initials(attempt.learnerName)}
              </span>
              <div>
                <h3>{attempt.learnerName}</h3>
                <p>
                  {attempt.title} · Submitted{" "}
                  {formatTime(attempt.submittedAt)}
                </p>
              </div>
              <span className={`review-status ${attempt.status}`}>
                {attempt.status.replace("-", " ")}
              </span>
            </header>
            {attempt.response ? (
              <div className="marking-workbench">
                <div className="learner-response">
                  <span>Constructed response</span>
                  <h4>{attempt.response.prompt}</h4>
                  <blockquote>{attempt.response.responseText}</blockquote>
                </div>
                <div className="marking-controls">
                  <label>
                    Awarded marks
                    <span>
                      <input
                        max={attempt.response.maximumMarks}
                        min="0"
                        onChange={(event) => setMarks(event.target.value)}
                        type="number"
                        value={marks}
                      />
                      / {attempt.response.maximumMarks}
                    </span>
                  </label>
                  <label>
                    Feedback to learner
                    <textarea
                      onChange={(event) => setFeedback(event.target.value)}
                      rows={3}
                      value={feedback}
                    />
                  </label>
                  <button
                    className="primary-assessment-button"
                    onClick={() =>
                      void updateQueue({
                        action: "mark",
                        attemptId: attempt.attemptId,
                        feedback,
                        marks: Number(marks),
                        questionVersionId:
                          attempt.response!.questionVersionId,
                      })
                    }
                    type="button"
                  >
                    Save mark
                  </button>
                </div>
              </div>
            ) : (
              <div className="release-result-row">
                <div>
                  <span>Final score</span>
                  <strong>
                    {attempt.score} / {attempt.maximumMarks}
                  </strong>
                </div>
                {attempt.status === "marked" ? (
                  <button
                    className="primary-assessment-button"
                    onClick={() =>
                      void updateQueue({
                        action: "release",
                        attemptId: attempt.attemptId,
                      })
                    }
                    type="button"
                  >
                    Release result
                  </button>
                ) : (
                  <span className="released-note">Visible to learner</span>
                )}
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

type CreateQuestionFormInput = {
  correctAnswer: string;
  difficulty: QuestionBankSummary["difficulty"];
  marks: number;
  options: string[];
  prompt: string;
  rationale: string;
  topic: string;
  type: QuestionType;
};

type CreateQuizFormInput = {
  instructions: string;
  passMarkPercent: number;
  purpose: AssessmentPurpose;
  questionIds: string[];
  timeLimitMinutes: number;
  title: string;
};

function QuestionForm({
  onSubmit,
}: {
  onSubmit: (input: CreateQuestionFormInput) => Promise<void>;
}) {
  const [type, setType] = useState<QuestionType>("single-choice");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const form = new FormData(event.currentTarget);
    await onSubmit({
      correctAnswer: String(form.get("correctAnswer") ?? ""),
      difficulty: String(
        form.get("difficulty") ?? "standard",
      ) as CreateQuestionFormInput["difficulty"],
      marks: Number(form.get("marks") ?? 1),
      options: String(form.get("options") ?? "").split("\n"),
      prompt: String(form.get("prompt") ?? ""),
      rationale: String(form.get("rationale") ?? ""),
      topic: String(form.get("topic") ?? ""),
      type,
    });
    setBusy(false);
  }

  return (
    <form className="question-form" onSubmit={submit}>
      <div className="form-section-title">
        <span>New bank item</span>
        <strong>Author the question and answer model</strong>
      </div>
      <div className="question-form-grid">
        <label className="wide-field">
          Question prompt
          <textarea
            defaultValue="Which organ stores and churns food during digestion?"
            name="prompt"
            required
            rows={3}
          />
        </label>
        <label>
          Item type
          <select
            name="type"
            onChange={(event) => setType(event.target.value as QuestionType)}
            value={type}
          >
            {Object.entries(typeLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Topic
          <input
            defaultValue="Human body systems"
            name="topic"
            required
          />
        </label>
        <label>
          Difficulty
          <select defaultValue="standard" name="difficulty">
            <option value="foundation">Foundation</option>
            <option value="standard">Standard</option>
            <option value="challenge">Challenge</option>
          </select>
        </label>
        <label>
          Marks
          <input defaultValue="1" max="100" min="1" name="marks" type="number" />
        </label>
        <label className="wide-field">
          Options, one per line
          <textarea
            defaultValue={"Mouth\nStomach\nSmall intestine\nLarge intestine"}
            name="options"
            rows={4}
          />
        </label>
        <label>
          Correct answer or rubric
          <input defaultValue="Stomach" name="correctAnswer" />
        </label>
        <label>
          Explanation
          <input
            defaultValue="The stomach stores food and churns it with digestive juices."
            name="rationale"
          />
        </label>
      </div>
      <div className="question-form-actions">
        <small>
          New items are versioned and approved for this subject bank.
        </small>
        <button
          className="primary-assessment-button"
          disabled={busy}
          type="submit"
        >
          {busy ? "Saving…" : "Save to question bank"}
        </button>
      </div>
    </form>
  );
}

function question(
  id: string,
  prompt: string,
  type: QuestionType,
  marks: number,
  difficulty: QuestionBankSummary["difficulty"],
  usageCount: number,
): QuestionBankSummary {
  return {
    difficulty,
    id,
    marks,
    prompt,
    status: "approved",
    topic: "Human body systems",
    type,
    usageCount,
    version: 1,
  };
}

function questionSymbol(type: QuestionType) {
  if (type === "single-choice" || type === "multiple-choice") return "●";
  if (type === "true-false") return "T";
  if (type === "matching") return "↔";
  if (type === "ordering") return "≡";
  if (type === "essay") return "¶";
  if (type === "numeric") return "#";
  return "?";
}

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en-GH", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
