/**
 * Generated artwork for a lesson video that has no thumbnail.
 *
 * A teacher can attach a still, and most will not — making one is a job on top
 * of preparing the lesson. Without this the block showed a black rectangle,
 * which reads as a broken video rather than an unstarted one.
 *
 * Four templates, picked by hashing the block id, so the same activity draws
 * the same art on every render and two videos in one lesson do not come out
 * identical. Deliberately unlettered: the block's title is already set beside
 * the player, and drawing it into the image would only repeat it somewhere a
 * screen reader cannot reach.
 */

const PALETTES: readonly [string, string, string][] = [
  /* [from, to, accent] — all read as a school's own palette rather than
     stock gradients, and all keep the centre dark enough for the white glass
     play control to sit on top at full contrast. */
  ["#0d6d53", "#0a2f2a", "#e9b84b"],
  ["#1f4f8f", "#0e1f3f", "#7fc4f2"],
  ["#7a3a86", "#2a1338", "#f0a6d0"],
  ["#a4472b", "#3a1710", "#f2c078"],
  ["#1f7f7a", "#0c3230", "#9fe5c8"],
  ["#4a4f9e", "#1a1c40", "#c3b4f5"],
];

type Template = 0 | 1 | 2 | 3;

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (Math.imul(hash, 31) + value.charCodeAt(index)) >>> 0;
  }
  /* Avalanche step. Without it the low bits barely move between similar seeds
     — block ids share a prefix — and picking the palette and the template from
     two slices of the same number put five of eight sample blocks on the same
     template. */
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d) >>> 0;
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b) >>> 0;
  return (hash ^ (hash >>> 16)) >>> 0;
}

export function LessonPoster({
  className,
  seed,
}: {
  className?: string;
  /** Stable per block, so the art does not reshuffle between renders. */
  seed: string;
}) {
  /* Two independently salted hashes rather than two slices of one, so palette
     and template vary freely of each other. */
  const [from, to, accent] = PALETTES[hashString(seed) % PALETTES.length];
  const template = (hashString(`${seed}:template`) % 4) as Template;
  const key = seed.replace(/[^a-z0-9-]/gi, "") || "poster";

  return (
    <svg
      aria-hidden="true"
      className={className}
      preserveAspectRatio="xMidYMid slice"
      role="presentation"
      viewBox="0 0 640 360"
    >
      <defs>
        <linearGradient id={`lp-bg-${key}`} x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor={from} />
          <stop offset="100%" stopColor={to} />
        </linearGradient>
        {/* Darkens the middle so the play control keeps its contrast whichever
            template is drawn behind it. */}
        <radialGradient id={`lp-center-${key}`}>
          <stop offset="0%" stopColor="#000000" stopOpacity="0.34" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect fill={`url(#lp-bg-${key})`} height="360" width="640" />

      {template === 0 ? <Arcs accent={accent} /> : null}
      {template === 1 ? <Waves accent={accent} /> : null}
      {template === 2 ? <Grid accent={accent} keyed={key} /> : null}
      {template === 3 ? <Bands accent={accent} /> : null}

      <rect fill={`url(#lp-center-${key})`} height="360" width="640" />
    </svg>
  );
}

/** Concentric rings breaking off the top-right corner. */
function Arcs({ accent }: { accent: string }) {
  return (
    <g fill="none" stroke={accent}>
      {[70, 118, 166, 214, 262].map((radius, index) => (
        <circle
          cx="548"
          cy="74"
          key={radius}
          r={radius}
          strokeOpacity={0.32 - index * 0.05}
          strokeWidth="2"
        />
      ))}
      <circle cx="548" cy="74" fill={accent} fillOpacity="0.16" r="42" stroke="none" />
    </g>
  );
}

/** Layered swells across the lower half. */
function Waves({ accent }: { accent: string }) {
  return (
    <g>
      <path
        d="M0 250c92-40 168-40 260 0s168 40 260 0 92-30 120-36v146H0Z"
        fill={accent}
        fillOpacity="0.12"
      />
      <path
        d="M0 292c92-40 168-40 260 0s168 40 260 0 92-30 120-36v104H0Z"
        fill={accent}
        fillOpacity="0.18"
      />
      <path
        d="M0 334c92-34 168-34 260 0s168 34 260 0 92-24 120-30v56H0Z"
        fill="#ffffff"
        fillOpacity="0.07"
      />
    </g>
  );
}

/** A dot field with one warm orb sitting over it. */
function Grid({ accent, keyed }: { accent: string; keyed: string }) {
  return (
    <g>
      <defs>
        <pattern
          height="34"
          id={`lp-dots-${keyed}`}
          patternUnits="userSpaceOnUse"
          width="34"
        >
          <circle cx="3" cy="3" fill="#ffffff" fillOpacity="0.16" r="2.5" />
        </pattern>
      </defs>
      <rect fill={`url(#lp-dots-${keyed})`} height="360" width="640" />
      <circle cx="112" cy="286" fill={accent} fillOpacity="0.2" r="128" />
      <circle cx="112" cy="286" fill={accent} fillOpacity="0.14" r="76" />
    </g>
  );
}

/** Diagonal ribbons running corner to corner. */
function Bands({ accent }: { accent: string }) {
  return (
    <g transform="rotate(-24 320 180)">
      {[-40, 60, 160, 260, 360].map((x, index) => (
        <rect
          fill={index % 2 === 0 ? accent : "#ffffff"}
          fillOpacity={index % 2 === 0 ? 0.15 : 0.06}
          height="520"
          key={x}
          width={index % 2 === 0 ? 54 : 26}
          x={x}
          y="-80"
        />
      ))}
    </g>
  );
}
