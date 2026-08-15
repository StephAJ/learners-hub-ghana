"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import type {
  PracticeMark,
  PracticeSet,
} from "../../../../db/practice-repository";
import { ArrowLeftIcon, CheckIcon, SparkIcon } from "../../../components/icons";
import { QuestionInput } from "../../../components/question-input";
import {
  QuestionFigure,
  QuestionFormula,
} from "../../../components/question-media";
import { subjectHue } from "../../../../domain/school/subject-hue";
import "./practice.css";

/* ==========================================================================
   Practice

   The one place in the product where getting it wrong costs nothing.

   Everything here is shaped by that. There is no clock, because a clock
   teaches speed where you want thinking. There is no score carried anywhere,
   because the moment a number follows a learner out of this screen they will
   stop practising the things they find hard. Answering shows whether it was
   right, what the right answer was, and why — immediately, whichever it was,
   because being told the reasoning only when you are wrong makes being right
   uninformative.

   The streak counter is deliberately small and deliberately resets to nothing
   on leaving. It is there to make a run of correct answers feel like
   something in the moment, not to become a record a learner protects.
   ========================================================================== */

export function PracticeRunner({ initial }: { initial: PracticeSet }) {
  const [set, setSet] = useState(initial);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState<unknown>(null);
  const [mark, setMark] = useState<PracticeMark | null>(null);
  const [checking, setChecking] = useState(false);
  const [notice, setNotice] = useState("");
  const [seed, setSeed] = useState(0);
  const [topic, setTopic] = useState("");
  const [streak, setStreak] = useState(0);
  const [best, setBest] = useState(0);

  const question = set.questions[index];
  const offeringId = set.offeringId;

  const loadSet = useCallback(
    async (nextSeed: number, nextTopic: string) => {
      const parameters = new URLSearchParams({
        offeringId,
        seed: String(nextSeed),
      });
      if (nextTopic) parameters.set("topic", nextTopic);
      const response = await fetch(`/api/learn/practice?${parameters}`);
      const payload = (await response.json()) as {
        error?: string;
        set?: PracticeSet;
      };
      if (!response.ok || !payload.set) {
        setNotice(payload.error ?? "Those questions could not be loaded.");
        return;
      }
      setSet(payload.set);
      setIndex(0);
      setAnswer(null);
      setMark(null);
      setNotice("");
    },
    [offeringId],
  );

  async function check() {
    if (!question || mark || checking) return;
    setChecking(true);
    try {
      const response = await fetch("/api/learn/practice", {
        body: JSON.stringify({
          offeringId,
          questionId: question.id,
          value: answer,
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json()) as {
        error?: string;
        mark?: PracticeMark;
      };
      if (!response.ok || !payload.mark) {
        setNotice(payload.error ?? "That answer could not be checked.");
        return;
      }
      setMark(payload.mark);
      setStreak((current) => {
        const next = payload.mark?.correct ? current + 1 : 0;
        setBest((highest) => Math.max(highest, next));
        return next;
      });
    } finally {
      setChecking(false);
    }
  }

  /* Loading is done from the handler that causes it rather than from an
     effect watching the state it sets. An effect here would also have had to
     skip its own first run, since the server already sent the opening set. */
  function chooseTopic(next: string) {
    setTopic(next);
    setSeed(0);
    void loadSet(0, next);
  }

  function next() {
    setMark(null);
    setAnswer(null);
    if (index + 1 < set.questions.length) {
      setIndex(index + 1);
      return;
    }
    /* End of the set: another one rather than a results screen. A results
       screen is a test's ending, and this is not a test. */
    const nextSeed = seed + set.questions.length;
    setSeed(nextSeed);
    void loadSet(nextSeed, topic);
  }

  function retry() {
    setMark(null);
    setAnswer(null);
  }

  const hue = subjectHue(set.subjectName);

  if (!question) {
    return (
      <div className="practice-shell" data-hue={hue}>
        <PracticeRail streak={streak} subjectName={set.subjectName} />
        <div className="practice-empty">
          <h2>Nothing to practise here yet</h2>
          <p>
            Your teacher builds the question bank as the term goes on. Once
            there are questions in this subject they will show up here.
          </p>
          <Link className="practice-primary" href="/learn/subjects">
            Back to my subjects
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="practice-shell" data-hue={hue}>
      <PracticeRail streak={streak} subjectName={set.subjectName} />

      <div className="practice-stage">
        {set.topics.length > 1 ? (
          <div className="practice-topics">
            <button
              className={topic === "" ? "is-on" : ""}
              onClick={() => chooseTopic("")}
              type="button"
            >
              Everything
            </button>
            {set.topics.map((entry) => (
              <button
                className={topic === entry ? "is-on" : ""}
                key={entry}
                onClick={() => chooseTopic(entry)}
                type="button"
              >
                {entry}
              </button>
            ))}
          </div>
        ) : null}

        <article className="practice-card">
          <header>
            <span className="practice-count">
              {index + 1} of {set.questions.length}
            </span>
            {question.topic ? <small>{question.topic}</small> : null}
          </header>

          <h1>{question.prompt}</h1>

          {question.formula ? (
            <QuestionFormula formula={question.formula} />
          ) : null}
          {question.media ? <QuestionFigure media={question.media} /> : null}

          <QuestionInput
            /* Locked once marked, so the feedback below cannot end up
               describing an answer that is no longer on screen. */
            disabled={Boolean(mark)}
            onChange={setAnswer}
            question={question}
            value={answer}
          />

          {mark ? (
            <div
              className={`practice-verdict${mark.correct ? " is-right" : ""}`}
              role="status"
            >
              <strong>
                {mark.correct ? (
                  <>
                    <CheckIcon size={16} /> Right
                  </>
                ) : (
                  "Not quite"
                )}
              </strong>
              {!mark.correct ? (
                <p className="practice-expected">
                  The answer is <b>{mark.expected}</b>.
                </p>
              ) : null}
              {mark.rationale ? <p>{mark.rationale}</p> : null}
            </div>
          ) : null}

          {notice ? <p className="practice-notice">{notice}</p> : null}

          <footer>
            {mark ? (
              <>
                {!mark.correct ? (
                  <button className="practice-secondary" onClick={retry} type="button">
                    Try it again
                  </button>
                ) : null}
                <button className="practice-primary" onClick={next} type="button">
                  {index + 1 < set.questions.length
                    ? "Next question"
                    : "More questions"}
                </button>
              </>
            ) : (
              <button
                className="practice-primary"
                disabled={checking}
                onClick={() => void check()}
                type="button"
              >
                {checking ? "Checking…" : "Check my answer"}
              </button>
            )}
          </footer>
        </article>

        <p className="practice-footnote">
          Nothing here is recorded. Practise as many times as you like.
          {best > 1 ? ` Your best run this visit: ${best} in a row.` : ""}
        </p>
      </div>
    </div>
  );
}

function PracticeRail({
  streak,
  subjectName,
}: {
  streak: number;
  subjectName: string;
}) {
  return (
    <header className="practice-rail">
      <Link className="practice-back" href="/learn/subjects">
        <ArrowLeftIcon size={14} />
        All subjects
      </Link>
      <div className="practice-title">
        <p>Practice</p>
        <h2>{subjectName}</h2>
      </div>
      {streak > 1 ? (
        <span className="practice-streak">
          <SparkIcon size={14} />
          {streak} in a row
        </span>
      ) : null}
    </header>
  );
}
