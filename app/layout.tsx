import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";
import "./public-site.css";
import "./workspace.css";

const description =
  "The school system Greenfield Academy uses for admissions, lesson planning, attendance, marking, and end-of-term reports.";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ??
    requestHeaders.get("host") ??
    "localhost:3000";
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  const metadataBase = new URL(`${protocol}://${host}`);

  return {
    title: {
      default: "Learners Hub",
      template: "%s · Learners Hub",
    },
    description,
    applicationName: "Learners Hub",
    metadataBase,
    openGraph: {
      title: "Learners Hub",
      description: "One school system, from admissions to reports.",
      images: [
        {
          alt: "The Learners Hub school workspace",
          url: "/og-unified.png",
        },
      ],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: "Learners Hub",
      description: "One school system, from admissions to reports.",
      images: ["/og-unified.png"],
    },
  };
}

export const viewport: Viewport = {
  themeColor: "#0d5f55",
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
