import type { Metadata, Viewport } from "next";
import { Inter, Poppins } from "next/font/google";
import { headers } from "next/headers";
import { restoreSidebarState } from "./components/sidebar-storage";
import "./globals.css";
import "./workspace.css";

/* Self-hosted at build time rather than fetched from Google, so a learner on a
   slow connection makes one fewer third-party request and the school is not
   leaking who is reading what. `swap` keeps text readable while it loads. */
const inter = Inter({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-inter",
});

/* Poppins carries the reading copy — lesson text, summaries, descriptions. Its
   wide apertures and near-geometric round forms hold up well at the sizes a
   learner reads paragraphs at on a phone. Interface text stays on Inter, which
   is tighter and better suited to labels, numbers and dense controls. */
const poppins = Poppins({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-poppins",
  weight: ["400", "500", "600"],
});

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
          alt: "The Learners Hub school hub",
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
    /* suppressHydrationWarning because the script below is meant to change
       this element before React reaches it: it sets data-sidebar from the
       stored preference so a returning user never sees the sidebar open wide
       and then snap shut. The server cannot know that preference, so the
       markup React rendered and the markup in the document differ by design,
       and only on this one element. */
    <html
      className={`${inter.variable} ${poppins.variable}`}
      lang="en"
      suppressHydrationWarning
    >
      <head>
        {/* Restores the collapsed sidebar before first paint. It sat in the
            workspace shell, inside the rendered tree, where React refuses to
            execute a script on the client and says so on every render:
            "Scripts inside React components are never executed when
            rendering on the client".

            The document head is where a script that must run before paint
            belongs, and it is the placement React does not object to. It is
            in the root layout rather than a workspace one because the
            preference is a single flag on <html> that no one workspace
            owns. */}
        <script dangerouslySetInnerHTML={{ __html: restoreSidebarState }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
