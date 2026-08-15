import type { Metadata, Viewport } from "next";
import { Inter, Lora, Poppins } from "next/font/google";
import { headers } from "next/headers";
import { restoreSidebarState } from "./components/sidebar-storage";
import { loadSchoolProfile } from "../db/school-profile-repository";
import { SCHOOL_TENANT_ID } from "../server/school-tenant";
import { ServiceWorkerRegistration } from "./components/service-worker-registration";
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

/* The display face for page and panel headings, and the one thing stopping
   this reading like every other dashboard.

   It was never actually loaded: --font-serif in globals.css listed
   `ui-serif, Georgia, …` and no webfont, so every heading in the product has
   been rendering in Georgia. Lora has a real medium and semibold, which
   Georgia does not — headings can now carry weight instead of relying on size
   alone for presence. */
const lora = Lora({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-lora",
  weight: ["400", "500", "600"],
});

/* ==========================================================================
   What a link preview says

   This was "The school system Greenfield Academy uses for…" — the demo
   school's name in the description of every page, on every deployment. It is
   the one piece of text a school never sees in its own product and everyone
   else sees first: it is what a search engine indexes and what WhatsApp shows
   when a parent forwards a link to the admissions form.

   Read from the school's own record like everything else. A failure falls back
   to the product's name rather than to a school that is not this one.
   ========================================================================== */
export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const school = await loadSchoolProfile(SCHOOL_TENANT_ID).catch(() => null);
  const schoolName = school?.name?.trim();
  const description = schoolName
    ? `The school system ${schoolName} uses for admissions, lesson planning, attendance, marking, and end-of-term reports.`
    : "One school system, from admissions to reports.";
  const shortDescription = schoolName
    ? `${schoolName}: one school system, from admissions to reports.`
    : "One school system, from admissions to reports.";
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
      title: schoolName ?? "Learners Hub",
      description: shortDescription,
      images: [
        {
          alt: schoolName ? `${schoolName} on Learners Hub` : "The Learners Hub school hub",
          url: "/og-unified.png",
        },
      ],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: schoolName ?? "Learners Hub",
      description: shortDescription,
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
      className={`${inter.variable} ${lora.variable} ${poppins.variable}`}
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
      <body>
        {children}
        {/* The PWA had a manifest and no service worker, so it was
            installable and had no offline behaviour whatsoever. */}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
