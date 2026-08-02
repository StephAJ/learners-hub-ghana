import type { SVGProps } from "react";

/* ==========================================================================
   Icons

   Hand-drawn on a 24-unit grid rather than pulled from an icon package: the
   set is small, it never needs to grow much, and a dependency would ship
   hundreds of glyphs to every learner on a metered connection to render the
   six in the sidebar.

   All of them inherit `currentColor` and size from the `size` prop, so a call
   site sets colour by setting text colour. Strokes are 1.75 at 24 units, which
   holds up at the 18-20px these render at without going spindly.
   ========================================================================== */

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ children, size = 20, ...props }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      focusable="false"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.75}
      viewBox="0 0 24 24"
      width={size}
      {...props}
    >
      {children}
    </svg>
  );
}

/* -- Navigation ---------------------------------------------------------- */

export function HomeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5" />
      <path d="M9.5 21v-6h5v6" />
    </Icon>
  );
}

export function BooksIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H9a2 2 0 0 1 2 2v14a1.5 1.5 0 0 0-1.5-1.5h-4A1.5 1.5 0 0 1 4 16Z" />
      <path d="M20 4.5A1.5 1.5 0 0 0 18.5 3H15a2 2 0 0 0-2 2v14a1.5 1.5 0 0 1 1.5-1.5h4A1.5 1.5 0 0 0 20 16Z" />
    </Icon>
  );
}

export function CalendarIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect height="16" rx="2" width="18" x="3" y="5" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </Icon>
  );
}

export function ClipboardCheckIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M9 4H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2" />
      <rect height="4" rx="1" width="6" x="9" y="2.5" />
      <path d="m9.5 13.5 2 2 3.5-4" />
    </Icon>
  );
}

export function UsersIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="9" cy="8" r="3.25" />
      <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
      <path d="M16 5.5a3.25 3.25 0 0 1 0 6.3" />
      <path d="M17.5 14.6a5.5 5.5 0 0 1 3 5.4" />
    </Icon>
  );
}

export function LayersIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m12 3 8.5 4.5L12 12 3.5 7.5Z" />
      <path d="m4 12 8 4.2 8-4.2" />
      <path d="m4 16.5 8 4.2 8-4.2" />
    </Icon>
  );
}

export function ChartIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 20V4" />
      <path d="M4 20h16" />
      <path d="M8 20v-5M12.5 20V9M17 20v-8" />
    </Icon>
  );
}

export function InboxIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 13h4l1.5 3h7L17 13h4" />
      <path d="M5.2 5.6 3 13v5a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5l-2.2-7.4A2 2 0 0 0 16.9 4H7.1a2 2 0 0 0-1.9 1.6Z" />
    </Icon>
  );
}

export function FileTextIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
      <path d="M14 3v5h5M9 13h6M9 17h4" />
    </Icon>
  );
}

export function ImageIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect height="16" rx="2" width="18" x="3" y="4" />
      <circle cx="8.5" cy="9.5" r="1.5" />
      <path d="m3 16 4.5-4.5L13 17l3-3 5 5" />
    </Icon>
  );
}

/* -- Lesson activities --------------------------------------------------- */

export function PlayCircleIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M10 8.5 16 12l-6 3.5Z" />
    </Icon>
  );
}

/* A bare, filled triangle rather than the outline used elsewhere — reads
   better solo on a glassmorphic overlay than a thin stroke does. */
export function PlayIcon(props: IconProps) {
  return (
    <Icon fill="currentColor" stroke="none" {...props}>
      <path d="M8 5.5v13l11-6.5Z" />
    </Icon>
  );
}

export function ReadIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 6.5C10.5 5 8.5 4.5 4 4.5V18c4.5 0 6.5.5 8 2 1.5-1.5 3.5-2 8-2V4.5c-4.5 0-6.5.5-8 2Z" />
      <path d="M12 6.5V20" />
    </Icon>
  );
}

export function SparkIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4" />
      <path d="M6.4 6.4 9 9M15 15l2.6 2.6M17.6 6.4 15 9M9 15l-2.6 2.6" />
    </Icon>
  );
}

export function PencilIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3Z" />
      <path d="m14.5 6.5 3 3" />
    </Icon>
  );
}

export function DownloadIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3v11" />
      <path d="m7.5 10 4.5 4.5L16.5 10" />
      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </Icon>
  );
}

/* -- Controls and status ------------------------------------------------- */

export function ArrowLeftIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M19 12H5" />
      <path d="m11 6-6 6 6 6" />
    </Icon>
  );
}

export function ChevronLeftIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m14.5 5.5-6 6.5 6 6.5" />
    </Icon>
  );
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m9.5 5.5 6 6.5-6 6.5" />
    </Icon>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m5 12.5 4.5 4.5L19 7" />
    </Icon>
  );
}

export function LockIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect height="10" rx="2" width="14" x="5" y="11" />
      <path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3" />
    </Icon>
  );
}

export function ClockIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5.2l3.2 2" />
    </Icon>
  );
}

export function SignOutIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M14 20H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h8" />
      <path d="M17 15.5 20.5 12 17 8.5M20 12H9.5" />
    </Icon>
  );
}

export function PanelCollapseIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect height="16" rx="2" width="18" x="3" y="4" />
      <path d="M10 4v16" />
    </Icon>
  );
}
