import Image from "next/image";
import "./person-avatar.css";

/* ==========================================================================
   Person avatar

   One component for every face in the product: the register, the markbook,
   the marking queue, the People directory, the guardian's view of their
   child, and the signed-in person in the sidebar.

   Before this there were ten copies of the same three-line `initials()`
   helper and ten differently-sized coloured circles. The photograph is the
   point — a form tutor reads a register by face, not by two letters — but
   initials stay as the fallback, because a real school always has a handful
   of people whose photograph has not been taken yet.

   `size` is a number rather than a variant name because the call sites want
   genuinely different sizes (28px in a dense markbook row, 64px on a detail
   panel) and inventing five names for five numbers helps nobody. It drives
   both the box and the initials, so the text never outgrows the circle.
   ========================================================================== */

export type PersonAvatarProps = {
  className?: string;
  /** Distinguishes staff from learners when only initials are shown. */
  kind?: "staff" | "learner" | "guardian";
  name: string;
  photoUrl?: string | null;
  /** Rendered box, in pixels. */
  size?: number;
};

export function PersonAvatar({
  className,
  kind,
  name,
  photoUrl,
  size = 40,
}: PersonAvatarProps) {
  const classNames = [
    "person-photo",
    kind ? `person-photo-${kind}` : undefined,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span
      className={classNames}
      style={{
        /* Initials track the box so a 28px chip and a 64px panel avatar are
           the same design rather than two. */
        "--person-photo-size": `${size}px`,
        "--person-photo-type": `${Math.round(size * 0.36)}px`,
      } as React.CSSProperties}
    >
      {photoUrl ? (
        <Image
          alt=""
          className="person-photo-image"
          height={size}
          /* The box is fixed and square, so one density-aware request per
             size is all next/image needs to emit. */
          sizes={`${size}px`}
          src={photoUrl}
          width={size}
        />
      ) : (
        <span aria-hidden="true">{initials(name)}</span>
      )}
    </span>
  );
}

/**
 * Up to two letters from a person's name.
 *
 * Exported because a few surfaces still show initials for things that are not
 * people — a subject code chip, an application reference — and duplicating
 * this a eleventh time is what got us here.
 */
export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((part) => part[0] ?? "")
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
