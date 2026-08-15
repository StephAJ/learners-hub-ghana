"use client";

import { useState } from "react";
import {
  leftOptions,
  linkPair,
  normaliseMatches,
  ownerOf,
  pairNumber,
  rightOptions,
  stripSide,
  unlink,
  type MatchOption,
} from "./match-pairs";

/* ==========================================================================
   Matching, by tapping one thing and then another

   This was a dropdown per left-hand item. It worked, and it felt like filling
   in a form: the answer was only legible by opening six selects in turn, two
   rows could claim the same match without complaint, and on a phone every
   answer meant summoning the native picker wheel.

   Tap a term, tap what it goes with. The same gesture as the reorder list, and
   the same reason: hover and precise dragging are not available to most of the
   learners this is for, but tapping two things always is.

   A pair is shown by a number and a colour on both halves rather than by a
   line drawn between them. Lines need absolute positioning and re-measuring on
   every reflow, and they cross into an unreadable tangle at more than about
   four pairs. A shared badge survives the columns stacking on a narrow screen,
   which is where most of this is answered.
   ========================================================================== */

export function MatchResponse({
  disabled,
  onChange,
  options,
  value,
}: {
  disabled?: boolean;
  onChange: (value: Record<string, string>) => void;
  options: MatchOption[];
  value: unknown;
}) {
  const matches = normaliseMatches(value, options);
  const [armed, setArmed] = useState<string | null>(null);
  const lefts = leftOptions(options);
  const rights = rightOptions(options);

  function tapLeft(leftKey: string) {
    if (disabled) return;
    /* Tapping a joined row breaks it, which is the only way back and is
       where a learner reaches first when they change their mind. */
    if (matches[leftKey]) {
      onChange(unlink(matches, leftKey));
      setArmed(null);
      return;
    }
    setArmed((current) => (current === leftKey ? null : leftKey));
  }

  function tapRight(rightKey: string) {
    if (disabled) return;
    const owner = ownerOf(matches, rightKey);
    if (owner) {
      onChange(unlink(matches, owner));
      setArmed(null);
      return;
    }
    if (!armed) return;
    onChange(linkPair(matches, armed, rightKey));
    setArmed(null);
  }

  const joined = Object.keys(matches).length;

  return (
    <div className="match-response">
      <p className="match-hint">
        {armed
          ? "Now tap what it goes with."
          : "Tap something on the left, then tap what it goes with."}
      </p>

      <div className="match-columns">
        <ul className="match-column">
          {lefts.map((option) => {
            const key = stripSide(option.id);
            const isJoined = Boolean(matches[key]);
            const number = pairNumber(key, options);
            return (
              <li key={option.id}>
                <button
                  aria-pressed={armed === key}
                  className={`match-tile${armed === key ? " is-armed" : ""}${
                    isJoined ? ` is-joined hue-${(number - 1) % 6}` : ""
                  }`}
                  disabled={disabled}
                  onClick={() => tapLeft(key)}
                  type="button"
                >
                  {isJoined ? (
                    <span className="match-badge">{number}</span>
                  ) : null}
                  <span>{option.label}</span>
                </button>
              </li>
            );
          })}
        </ul>

        <ul className="match-column">
          {rights.map((option) => {
            const key = stripSide(option.id);
            const owner = ownerOf(matches, key);
            const number = owner ? pairNumber(owner, options) : 0;
            return (
              <li key={option.id}>
                <button
                  className={`match-tile${
                    owner ? ` is-joined hue-${(number - 1) % 6}` : ""
                  }${armed && !owner ? " is-target" : ""}`}
                  disabled={disabled}
                  onClick={() => tapRight(key)}
                  type="button"
                >
                  {owner ? <span className="match-badge">{number}</span> : null}
                  <span>{option.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <p aria-live="polite" className="match-status">
        {joined === 0
          ? "Nothing joined yet."
          : `${joined} of ${lefts.length} joined. Tap a joined pair to undo it.`}
      </p>
    </div>
  );
}
