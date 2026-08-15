"use client";

import { useState } from "react";
import {
  groupOptions,
  itemsIn,
  normalisePlacements,
  placeItem,
  removeItem,
  stripSide,
  unplaced,
  type SortOption,
} from "./group-sort";

/* ==========================================================================
   Sorting things into groups

   Tap an item, tap the group it belongs in. The same gesture as matching and
   the reorder list, which is the point: a learner who has understood one of
   these has understood all three, and none of them needs a mouse or a steady
   drag.

   The items sit in a tray above the groups rather than inside a list beside
   them, so the groups can be wide enough to hold what lands in them and the
   tray empties visibly as the work gets done. An item already in a group is
   tapped to take it back out.

   Nothing is ever displaced. A group holds as many items as belong in it, so
   unlike matching there is no case where placing one thing removes another —
   which also means a learner can never lose work they had already done by
   tapping in the wrong order.
   ========================================================================== */

export function GroupResponse({
  disabled,
  onChange,
  options,
  value,
}: {
  disabled?: boolean;
  onChange: (value: Record<string, string>) => void;
  options: SortOption[];
  value: unknown;
}) {
  const placed = normalisePlacements(value, options);
  const [held, setHeld] = useState<string | null>(null);
  const groups = groupOptions(options);
  const tray = unplaced(placed, options);
  const total = options.filter((option) => option.id.startsWith("left:")).length;
  const done = Object.keys(placed).length;

  function tapItem(itemKey: string) {
    if (disabled) return;
    setHeld((current) => (current === itemKey ? null : itemKey));
  }

  function tapPlaced(itemKey: string) {
    if (disabled) return;
    onChange(removeItem(placed, itemKey));
    setHeld(null);
  }

  function tapGroup(groupKey: string) {
    if (disabled || !held) return;
    onChange(placeItem(placed, held, groupKey));
    setHeld(null);
  }

  return (
    <div className="group-response">
      <p className="group-hint">
        {held
          ? "Now tap the group it belongs in."
          : "Tap something, then tap the group it belongs in."}
      </p>

      <div className="group-tray">
        {tray.length === 0 ? (
          <p className="group-tray-empty">
            Everything is placed. Tap an item to take it back.
          </p>
        ) : (
          tray.map((option) => {
            const key = stripSide(option.id);
            return (
              <button
                aria-pressed={held === key}
                className={`group-chip${held === key ? " is-held" : ""}`}
                disabled={disabled}
                key={option.id}
                onClick={() => tapItem(key)}
                type="button"
              >
                {option.label}
              </button>
            );
          })
        )}
      </div>

      <div className="group-bins">
        {groups.map((group, index) => {
          const groupKey = stripSide(group.id);
          const inside = itemsIn(placed, groupKey, options);
          return (
            <div
              className={`group-bin hue-${index % 6}${
                held ? " is-ready" : ""
              }`}
              key={group.id}
            >
              {/* The bin itself is the control. A learner aiming at a group
                  aims at the box, not at a small button inside it — and on a
                  phone the box is the only target big enough to trust. */}
              <button
                className="group-bin-head"
                disabled={disabled || !held}
                onClick={() => tapGroup(groupKey)}
                type="button"
              >
                <span className="group-bin-name">{group.label}</span>
                <span className="group-bin-count">{inside.length}</span>
              </button>

              <ul className="group-bin-items">
                {inside.map((option) => (
                  <li key={option.id}>
                    <button
                      aria-label={`Take ${option.label} out of ${group.label}`}
                      className="group-chip is-placed"
                      disabled={disabled}
                      onClick={() => tapPlaced(stripSide(option.id))}
                      type="button"
                    >
                      {option.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      <p aria-live="polite" className="group-status">
        {done === total
          ? "All placed. Tap anything to move it."
          : `${total - done} left to place.`}
      </p>
    </div>
  );
}
