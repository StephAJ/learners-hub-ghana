/* ==========================================================================
   Public-site decoration

   Flat SVG, no images, no dependencies. These carry the geometry that keeps
   the marketing pages from being a stack of plain rectangles — a dot field
   behind a section, an arc bleeding off a corner, a rule that steps down in
   weight. All of them inherit `currentColor` so a section sets the tone by
   setting text colour, and all of them are aria-hidden: they say nothing a
   reader needs.
   ========================================================================== */

/** A soft dot field. Used behind pale sections to stop them reading as blank. */
export function DotField({
  className,
  id,
}: {
  className?: string;
  /** Pattern ids must be unique per page or the first one wins everywhere. */
  id: string;
}) {
  return (
    <svg aria-hidden="true" className={className} focusable="false">
      <defs>
        <pattern
          height="22"
          id={id}
          patternUnits="userSpaceOnUse"
          width="22"
        >
          <circle cx="1.5" cy="1.5" fill="currentColor" r="1.5" />
        </pattern>
      </defs>
      <rect fill={`url(#${id})`} height="100%" width="100%" />
    </svg>
  );
}

/** Concentric quarter arcs, used bleeding off a corner. */
export function ArcStack({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      focusable="false"
      viewBox="0 0 200 200"
    >
      {[60, 100, 140, 180].map((radius, index) => (
        <circle
          cx="0"
          cy="200"
          key={radius}
          r={radius}
          stroke="currentColor"
          strokeOpacity={0.5 - index * 0.09}
          strokeWidth="1.5"
        />
      ))}
    </svg>
  );
}

/**
 * A stepped chevron band.
 *
 * A nod to the woven bands on Ghanaian cloth without copying any particular
 * pattern — it is geometry, not a motif that belongs to someone.
 */
export function ChevronBand({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      focusable="false"
      preserveAspectRatio="none"
      viewBox="0 0 120 12"
    >
      <path
        d="M0 12 6 0l6 12L18 0l6 12L30 0l6 12L42 0l6 12L54 0l6 12L66 0l6 12L78 0l6 12L90 0l6 12L102 0l6 12L114 0l6 12"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}

/** A single outlined ring, used as a corner accent on dark panels. */
export function RingAccent({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      focusable="false"
      viewBox="0 0 120 120"
    >
      <circle cx="60" cy="60" r="59" stroke="currentColor" strokeWidth="1.25" />
      <circle
        cx="60"
        cy="60"
        r="40"
        stroke="currentColor"
        strokeOpacity="0.55"
        strokeWidth="1.25"
      />
      <circle cx="60" cy="60" r="21" fill="currentColor" fillOpacity="0.14" />
    </svg>
  );
}
