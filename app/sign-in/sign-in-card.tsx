import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { BrandMark } from "../components/brand-mark";
import type { SchoolProfile } from "../../domain/school/public-profile";
import { AuthenticationForm } from "./authentication-form";
import "./auth.css";

/**
 * The sign-in card.
 *
 * Presentation only, so it renders without a session lookup — the route above
 * it does the redirect for an already-signed-in visitor.
 *
 * `children` is how the password-reset screens reuse the frame. They are the
 * same card with a different form in it, and a second copy of the aside, the
 * crest and the back link would be three more things to keep in step.
 */
export function SignInCard({
  children,
  initialMode,
  passwordReset,
  returnTo,
  school,
}: {
  children?: ReactNode;
  initialMode?: "register" | "sign-in";
  passwordReset?: boolean;
  returnTo?: string;
  school: SchoolProfile;
}) {
  /* A school that has not written any testimonials has none to quote. This
     read `school.testimonials[1].quote` outright, which is fine for the demo
     profile and throws for a school with fewer than two — including every
     school starting from the default profile. */
  const quote = school.testimonials[1] ?? school.testimonials[0];

  return (
    <div className="auth-page">
      <div className="auth-card">
        {/* The illustration is decorative framing for the form, so it is hidden
            from readers entirely rather than described. The quote beside it is
            the part that carries meaning, and that stays in the tree. */}
        <aside className="auth-aside">
          <Image
            alt=""
            aria-hidden="true"
            className="auth-aside-image"
            height={1000}
            priority
            sizes="(max-width: 900px) 0px, 46vw"
            src="/login%20image.jpg"
            width={1000}
          />
          <div className="auth-aside-scrim" />
          <div className="auth-aside-copy">
            <p className="auth-aside-kicker">{school.name}</p>
            {quote ? (
              <blockquote>
                &ldquo;{quote.quote}&rdquo;
                <footer>
                  <strong>{quote.name}</strong>
                  <span>{quote.role}</span>
                </footer>
              </blockquote>
            ) : (
              <blockquote>
                {school.strapline || "One record per learner, from the first day."}
              </blockquote>
            )}
          </div>
        </aside>

        <main className="auth-main">
          <div className="auth-topline">
            <Link className="auth-brand" href="/">
              <BrandMark size={36} />
              <span>
                <strong>Learners Hub</strong>
                <small>{school.name}</small>
              </span>
            </Link>
            <Link className="auth-back" href="/">
              <ArrowLeft aria-hidden="true" size={15} />
              School home
            </Link>
          </div>

          {children ?? (
            <AuthenticationForm
              initialMode={initialMode ?? "sign-in"}
              passwordReset={passwordReset}
              returnTo={returnTo ?? "/app"}
            />
          )}
        </main>
      </div>
    </div>
  );
}
