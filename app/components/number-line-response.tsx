"use client";

import { useRef, useState } from "react";

/* ==========================================================================
   Placing a value on a line

   The one question type here that is not tap-a-thing-tap-a-place, because
   what it tests is magnitude — where a number sits relative to others — and a
   text box tests only whether a learner can type it.

   Three ways to answer, for the same reason the reorder list has three:

   - Dragging the marker, on pointer events so it works under a thumb.
   - Tapping anywhere on the line, which is the whole interaction for anyone
     who finds dragging hard and is the faster one on a phone regardless.
   - Arrow keys once the marker has focus, which is what makes it answerable
     from a keyboard at all.

   The learner is marked on where they put it, within the tolerance the author
   set — so a line marked in tens does not demand pixel accuracy.
   ========================================================================== */

export function NumberLineResponse({
  disabled,
  max,
  min,
  onChange,
  step,
  value,
}: {
  disabled?: boolean;
  max: number;
  min: number;
  onChange: (value: number) => void;
  /** How far one arrow-key press moves. Defaults to a hundredth of the line. */
  step?: number;
  value: unknown;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const span = max - min || 1;
  const nudge = step ?? roundedStep(span);
  const placed = typeof value === "number" && Number.isFinite(value);
  const current = placed ? clamp(value as number, min, max) : min;
  const percent = ((current - min) / span) * 100;

  function valueAt(clientX: number): number {
    const track = trackRef.current?.getBoundingClientRect();
    if (!track || track.width === 0) return current;
    const ratio = clamp((clientX - track.left) / track.width, 0, 1);
    return round(min + ratio * span, nudge);
  }

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (disabled) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
    onChange(valueAt(event.clientX));
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!dragging || disabled) return;
    onChange(valueAt(event.clientX));
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (disabled) return;
    const by =
      event.key === "ArrowLeft" || event.key === "ArrowDown"
        ? -nudge
        : event.key === "ArrowRight" || event.key === "ArrowUp"
          ? nudge
          : 0;
    if (by === 0) return;
    event.preventDefault();
    onChange(round(clamp(current + by, min, max), nudge));
  }

  return (
    <div className="line-response">
      <p className="line-hint">
        Tap the line where the answer goes, or drag the marker. Arrow keys move
        it too.
      </p>

      <div
        className={`line-track${dragging ? " is-dragging" : ""}`}
        onPointerCancel={() => setDragging(false)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => setDragging(false)}
        ref={trackRef}
      >
        <div className="line-rule" aria-hidden="true">
          {ticks(min, max).map((tick) => (
            <span
              className="line-tick"
              key={tick}
              style={{ left: `${((tick - min) / span) * 100}%` }}
            >
              <i />
              <small>{formatTick(tick)}</small>
            </span>
          ))}
        </div>

        <button
          aria-label="Where the answer goes"
          aria-valuemax={max}
          aria-valuemin={min}
          aria-valuenow={placed ? current : undefined}
          aria-valuetext={placed ? String(current) : "not placed yet"}
          className={`line-marker${placed ? " is-placed" : ""}`}
          disabled={disabled}
          onKeyDown={onKeyDown}
          role="slider"
          style={{ left: `${placed ? percent : 0}%` }}
          type="button"
        />
      </div>

      <p aria-live="polite" className="line-readout">
        {placed ? (
          <>
            You have placed it at <b>{current}</b>.
          </>
        ) : (
          "Nothing placed yet."
        )}
      </p>
    </div>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Snapped to the step, so a drag cannot store 6.9999999999. */
function round(value: number, step: number): number {
  const snapped = Math.round(value / step) * step;
  return Number(snapped.toFixed(6));
}

/**
 * A sensible arrow-key step for the line's range.
 *
 * A line from 0 to 10 moves in tenths; one from 0 to 1000 moves in tens.
 * Without this a keyboard learner would need a thousand presses to cross a
 * wide line, or would be unable to hit a decimal on a narrow one.
 */
function roundedStep(span: number): number {
  const rough = span / 100;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  return magnitude || 0.01;
}

/** Labels at the ends and a few places between, never more than six. */
function ticks(min: number, max: number): number[] {
  const count = 5;
  const span = max - min;
  return Array.from({ length: count + 1 }, (_, index) =>
    Number((min + (span * index) / count).toFixed(6)),
  );
}

function formatTick(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
