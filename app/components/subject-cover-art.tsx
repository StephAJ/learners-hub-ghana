/**
 * Every subject's cover art is generated on the fly from its slug — no image
 * field exists on the subject record, and until schools can upload their own
 * artwork, a deterministic gradient stands in for one. Same subject, same
 * seed, same art on every render, so it reads as a real cover rather than
 * something that reshuffles on refresh.
 *
 * The artwork carries no lettering. The subject name sits directly beneath it
 * on the card, so a code drawn into the image only repeated it in a place a
 * screen reader could not reach.
 */
const PALETTES: readonly [string, string][] = [
  ["#0d6d53", "#123f3a"],
  ["#2f5fae", "#16294f"],
  ["#a4472b", "#4a1f13"],
  ["#6a3fae", "#2a1a4f"],
  ["#b98524", "#4a3410"],
  ["#1f8f8f", "#0f3f3f"],
  ["#c23f6b", "#4f1a2c"],
  ["#3f8f4a", "#153f1e"],
];

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (Math.imul(hash, 31) + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

export function SubjectCoverArt({
  className,
  seed,
}: {
  className?: string;
  seed: string;
}) {
  const hash = hashString(seed);
  const [from, to] = PALETTES[hash % PALETTES.length];
  const gradientId = `subject-cover-${seed.replace(/[^a-z0-9-]/gi, "")}`;
  const blobX = 60 + (hash % 140);
  const blobY = 20 + ((hash >>> 5) % 100);

  return (
    <svg
      aria-hidden="true"
      className={className}
      preserveAspectRatio="xMidYMid slice"
      role="presentation"
      viewBox="0 0 320 180"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor={from} />
          <stop offset="100%" stopColor={to} />
        </linearGradient>
      </defs>
      <rect fill={`url(#${gradientId})`} height="180" width="320" />
      <circle cx={blobX} cy={blobY} fill="#fff" fillOpacity="0.08" r="95" />
      <circle
        cx={320 - blobX * 0.6}
        cy={180 - blobY * 0.4}
        fill="#fff"
        fillOpacity="0.06"
        r="60"
      />
    </svg>
  );
}
