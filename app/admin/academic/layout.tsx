import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Academic setup",
  description:
    "Configure classes, class teachers, subject policies, and learner placements.",
};

export default function AcademicLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
