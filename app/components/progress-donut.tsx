/**
 * A progress donut.
 *
 * A stroked arc rather than a filled disc: the ring is the reading, and the
 * figure inside it is the label. Sized in `em` so a call site controls it by
 * setting font-size, and the stroke stays proportional at any size.
 */
export function ProgressDonut({
  className,
  percent,
}: {
  className?: string;
  percent: number;
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  const radius = 42;
  const circumference = 2 * Math.PI * radius;

  return (
    <div
      aria-label={`${clamped} percent complete`}
      className={`progress-donut${className ? ` ${className}` : ""}`}
      role="img"
    >
      <svg aria-hidden="true" viewBox="0 0 100 100">
        <circle className="donut-track" cx="50" cy="50" r={radius} />
        <circle
          className="donut-value"
          cx="50"
          cy="50"
          r={radius}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped / 100)}
        />
      </svg>
      <strong aria-hidden="true">{clamped}%</strong>
    </div>
  );
}
