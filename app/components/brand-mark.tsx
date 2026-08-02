import Image from "next/image";

/**
 * The Learners Hub mark.
 *
 * The logo is drawn in navy and teal on transparency. Both are dark, so on the
 * sidebar's deep green it would all but disappear — the mark therefore sits on
 * a light tile, which also gives it a consistent silhouette wherever it
 * appears. On light surfaces the tile is invisible and the logo simply reads.
 *
 * `unoptimized` because next.config disables the image optimizer; the file is
 * 118KB and served straight from /public.
 */
export function BrandMark({
  className,
  size = 40,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <span
      className={`brand-mark-tile${className ? ` ${className}` : ""}`}
      style={{ height: size, width: size }}
    >
      <Image
        alt=""
        aria-hidden="true"
        height={size}
        src="/learners-hub-logo.png"
        unoptimized
        width={size}
      />
    </span>
  );
}
