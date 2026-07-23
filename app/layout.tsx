import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";

const description =
  "A class-first learning and school management platform built for Ghanaian schools.";

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
      description: "Learning built around your class.",
      images: [{ alt: "Learners Hub class-first learning platform", url: "/og.png" }],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: "Learners Hub",
      description: "Learning built around your class.",
      images: ["/og.png"],
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
