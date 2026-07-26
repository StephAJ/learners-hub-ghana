import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";
import "./public-site.css";
import "./workspace.css";

const description =
  "Admissions, teaching, learning, records, and family updates in one connected school platform.";

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
      description: "Every school day, clearly connected.",
      images: [
        {
          alt: "Learners Hub connects the whole school day",
          url: "/og-unified.png",
        },
      ],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: "Learners Hub",
      description: "Every school day, clearly connected.",
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
