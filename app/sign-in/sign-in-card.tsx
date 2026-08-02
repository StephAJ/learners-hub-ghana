import Image from "next/image";
import Link from "next/link";
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
 */
export function SignInCard({
  initialMode,
  returnTo,
  school,
}: {
  initialMode: "register" | "sign-in";
  returnTo: string;
  school: SchoolProfile;
}) {
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
            <blockquote>
              &ldquo;{school.testimonials[1].quote}&rdquo;
              <footer>
                <strong>{school.testimonials[1].name}</strong>
                <span>{school.testimonials[1].role}</span>
              </footer>
            </blockquote>
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

          <AuthenticationForm initialMode={initialMode} returnTo={returnTo} />
        </main>
      </div>
    </div>
  );
}
