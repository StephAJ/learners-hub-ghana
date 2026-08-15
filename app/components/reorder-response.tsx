"use client";

import { useRef, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon, GripIcon } from "./icons";
import {
  normaliseOrder,
  reorder,
  type ReorderOption,
} from "./reorder-order";

/* ==========================================================================
   Putting things in order, by moving them

   An ordering question was a column of dropdowns — one per position, each
   listing every option. Nothing about it said "sequence": a learner could
   pick the same organ for positions two and four and the form would take it,
   the answer was only legible by reading six selects in turn, and the actual
   skill being tested — holding a sequence in mind and arranging it — was
   replaced by clerical work.

   The list is the answer now. It starts in the order the paper presents, and
   the learner moves items until it reads correctly.

   Three ways in, because one is never enough here:

   - Dragging, on pointer events rather than HTML5 drag-and-drop. The native
     API does not fire on touch at all, and this product is used on entry-level
     Android far more than on a mouse.
   - The two arrows on every row, which are the whole interaction for anyone
     using a keyboard or a screen reader, and are also the easier target on a
     small phone with a cracked digitiser.
   - Nothing at all: the starting order is a valid answer to submit.

   No library. A reorderable list is about a hundred lines, and the ones on npm
   ship a good deal more than that to every learner on a metered connection —
   the same reasoning as db/demo-media.ts and domain/reporting/report-pdf.ts.
   ========================================================================== */

export type { ReorderOption };

export function ReorderResponse({
  disabled,
  onChange,
  options,
  value,
}: {
  disabled?: boolean;
  onChange: (value: string[]) => void;
  options: ReorderOption[];
  value: unknown;
}) {
  const order = normaliseOrder(value, options);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const byId = new Map(options.map((option) => [option.id, option]));

  function moveBy(id: string, step: number) {
    const from = order.indexOf(id);
    const to = from + step;
    if (from < 0 || to < 0 || to >= order.length) return;
    onChange(reorder(order, from, to));
  }

  function onPointerDown(event: React.PointerEvent<HTMLButtonElement>, id: string) {
    if (disabled) return;
    /* Left button only; a right-click should open the menu, not start a drag. */
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDraggingId(id);
  }

  function onPointerMove(event: React.PointerEvent) {
    if (!draggingId) return;
    const rows = listRef.current?.querySelectorAll("li");
    if (!rows) return;

    /* Which row is the pointer inside? Read live rather than from a cached
       set of rectangles: the rows move as the list reorders under the
       pointer, so anything measured at drag start is wrong by the first
       swap. */
    let target = -1;
    rows.forEach((row, index) => {
      const box = row.getBoundingClientRect();
      if (event.clientY >= box.top && event.clientY <= box.bottom) {
        target = index;
      }
    });
    if (target < 0) return;

    const from = order.indexOf(draggingId);
    if (from < 0 || target === from) return;
    onChange(reorder(order, from, target));
  }

  function endDrag() {
    setDraggingId(null);
  }

  return (
    <div className="reorder-response">
      <p className="reorder-hint">
        Drag to arrange, or use the arrows. The order you leave is the answer.
      </p>
      <ol className="reorder-list" ref={listRef}>
        {order.map((id, index) => {
          const option = byId.get(id);
          if (!option) return null;
          const isDragging = id === draggingId;
          return (
            <li
              className={`reorder-item${isDragging ? " is-dragging" : ""}`}
              key={id}
              onPointerCancel={endDrag}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
            >
              <button
                aria-label={`Move ${option.label}`}
                className="reorder-grip"
                disabled={disabled}
                onPointerDown={(event) => onPointerDown(event, id)}
                type="button"
              >
                <GripIcon size={16} />
              </button>

              <span className="reorder-position" aria-hidden="true">
                {index + 1}
              </span>
              <span className="reorder-label">{option.label}</span>

              <span className="reorder-arrows">
                <button
                  aria-label={`Move ${option.label} earlier`}
                  disabled={disabled || index === 0}
                  onClick={() => moveBy(id, -1)}
                  type="button"
                >
                  <ChevronLeftIcon size={15} />
                </button>
                <button
                  aria-label={`Move ${option.label} later`}
                  disabled={disabled || index === order.length - 1}
                  onClick={() => moveBy(id, 1)}
                  type="button"
                >
                  <ChevronRightIcon size={15} />
                </button>
              </span>
            </li>
          );
        })}
      </ol>
      {/* The order in words, for a screen reader and for anyone checking their
          answer without re-reading the whole column. */}
      <p aria-live="polite" className="reorder-readback">
        {order
          .map((id, index) => `${index + 1}. ${byId.get(id)?.label ?? ""}`)
          .join("  ·  ")}
      </p>
    </div>
  );
}
