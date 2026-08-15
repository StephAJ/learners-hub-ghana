"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PanelCollapseIcon } from "./icons";

/* ==========================================================================
   The contents list, off-canvas on a narrow screen

   Both players — a lesson and a quiz paper — put their contents in a column
   beside the stage. Below 1080px that column had nowhere to go, so it sat
   above the stage instead: a learner opening a lesson on a phone met a
   20rem-tall list of every other lesson and had to scroll past it to reach
   the one they had chosen, and a learner sitting a paper met the same wall
   between every question.

   It slides in over the stage now. The list is a thing you consult and
   dismiss, which is what it already was on a wide screen — there it simply
   has the room to stay open.

   The hook rather than a wrapper component: the two shells differ in what
   goes in the rail and how an item is chosen, and a wrapper that took all of
   that as props would be harder to read than the four lines each screen
   spends on it here.
   ========================================================================== */

/** The width at and below which the outline goes off-canvas. Matches the
    breakpoint in lesson-player.css; the two have to agree, because this is
    what decides whether the page behind is scroll-locked. */
const OFF_CANVAS = "(max-width: 1080px)";

export type OutlineDrawer = {
  /** Dismiss it — pass to the scrim, the close control, and item selection. */
  close: () => void;
  isOpen: boolean;
  /** Spread onto the element that wraps the rail and the outline. */
  shellProps: { "data-outline": "closed" | "open" };
  toggle: () => void;
};

export function useOutlineDrawer(): OutlineDrawer {
  const [isOpen, setIsOpen] = useState(false);

  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((open) => !open), []);

  /* Escape dismisses it, as it does any layer over the page. Where focus goes
     afterwards is the toggle's business — see below. */
  useEffect(() => {
    if (!isOpen) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsOpen(false);
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen]);

  /* The page behind must not scroll under the drawer, and the drawer must not
     survive the viewport growing past the breakpoint — a learner who rotates
     a tablet would otherwise be left with the outline in the grid where it
     belongs and the body still locked. */
  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const wide = window.matchMedia(OFF_CANVAS);
    function onChange(event: MediaQueryListEvent) {
      if (!event.matches) setIsOpen(false);
    }
    wide.addEventListener("change", onChange);

    return () => {
      document.body.style.overflow = previousOverflow;
      wide.removeEventListener("change", onChange);
    };
  }, [isOpen]);

  return {
    close,
    isOpen,
    shellProps: { "data-outline": isOpen ? "open" : "closed" },
    toggle,
  };
}

/**
 * The control that opens the drawer, for the toprail.
 *
 * Hidden above the breakpoint by the stylesheet rather than by a media query
 * read in JavaScript, so it is right on the first paint.
 *
 * It owns the focus restoration rather than the hook: whatever the learner had
 * selected inside the drawer is hidden the moment it closes, so focus has to
 * land somewhere, and the control they opened it with is where they expect to
 * be. Keeping the ref here also keeps it out of the hook's return value, which
 * a ref has no business travelling through.
 */
export function OutlineToggle({
  drawer,
  label,
}: {
  drawer: OutlineDrawer;
  label: string;
}) {
  const button = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (wasOpen.current && !drawer.isOpen) button.current?.focus();
    wasOpen.current = drawer.isOpen;
  }, [drawer.isOpen]);

  return (
    <button
      aria-expanded={drawer.isOpen}
      aria-label={label}
      className="outline-toggle"
      onClick={drawer.toggle}
      ref={button}
      type="button"
    >
      <PanelCollapseIcon size={18} />
    </button>
  );
}

/**
 * The dimmed page behind the open drawer, which dismisses it when tapped.
 *
 * Always rendered so it can transition, and inert when closed — a scrim that
 * mounts on open cannot fade in, and one that stays clickable when closed
 * swallows every tap on the stage.
 */
export function OutlineScrim({ drawer }: { drawer: OutlineDrawer }) {
  return (
    <div
      aria-hidden="true"
      className="outline-scrim"
      onClick={drawer.close}
    />
  );
}
