import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Clock,
  Mail,
  MapPin,
  Phone,
} from "lucide-react";
import { BrandMark } from "../brand-mark";
import { HeroCarousel } from "./hero-carousel";
import { Reveal } from "./reveal";
import { SiteHeader } from "./site-header";
import { ArcStack, ChevronBand, DotField, RingAccent } from "./decor";
import type { PublicIntakeState } from "../../../db/intake-repository";
import type { SchoolProfile } from "../../../domain/school/public-profile";
import { signInPath } from "../../auth";
import "../../site.css";

const NAVIGATION = [
  { href: "#about", label: "About" },
  { href: "#academics", label: "Academics" },
  { href: "#student-life", label: "Student life" },
  { href: "#news", label: "News" },
  { href: "#visit", label: "Visit" },
];

/**
 * The school's public home page.
 *
 * Presentation only — it is handed a school profile and the two facts that
 * depend on who is asking. Keeping the session lookup in the route above it
 * means this renders anywhere, including without a database.
 */
export function Landing({
  intake,
  school,
  signInHref,
  signInLabel,
}: {
  /* Whether the school is actually taking applications, rather than what its
     profile once said it would. The admissions panel below reads this. */
  intake: PublicIntakeState;
  school: SchoolProfile;
  signInHref: string;
  signInLabel: string;
}) {
  const yearsTeaching = new Date().getFullYear() - school.established;

  return (
    <div className="site">
      <SiteHeader
        navigation={NAVIGATION}
        schoolName={school.name}
        signInHref={signInHref}
        signInLabel={signInLabel}
        strapline={school.location}
      />

      <main>
        <HeroCarousel slides={school.heroSlides} />

        {/* -- Three ways in ------------------------------------------------ */}
        <Reveal as="section" className="site-quicklinks">
          {school.quickLinks.map((link) => (
            <a className="site-quicklink" href={link.href} key={link.id}>
              <span className="site-quicklink-frame">
                <Image
                  alt={link.image.alt}
                  height={420}
                  sizes="(max-width: 760px) 100vw, 33vw"
                  src={link.image.src}
                  width={560}
                />
              </span>
              <span className="site-quicklink-foot">
                <span>
                  <strong>{link.label}</strong>
                  <small>{link.blurb}</small>
                </span>
                <i aria-hidden="true">
                  <ArrowUpRight size={18} />
                </i>
              </span>
            </a>
          ))}
        </Reveal>

        {/* -- Who we are --------------------------------------------------- */}
        <section className="site-about" id="about">
          <DotField className="site-about-dots" id="about-dots" />
          <Reveal className="site-about-inner">
            <div className="site-about-copy" data-reveal>
              <p className="site-kicker">Who we are</p>
              <h2>
                A basic school small enough to know every child by name.
              </h2>
              <p className="site-lead">
                Greenfield Academy has taught the Ghana Education Service
                curriculum in Osu for {yearsTeaching} years. We take children
                from Kindergarten 1 through to the BECE, and we keep classes at
                eighteen so a teacher can tell you how your child is actually
                getting on.
              </p>
              <p>
                Every mark, register and report is recorded against one record
                per learner, and families can read it the same day rather than
                waiting for the terminal report. That is the whole reason we
                built Learners Hub.
              </p>
              <Link className="site-button site-button-solid" href="/admissions">
                Read about admissions
                <ArrowRight aria-hidden="true" size={17} />
              </Link>
            </div>

            <div className="site-about-figure" data-reveal>
              <Image
                alt="A Greenfield pupil smiling on the school steps with her workbook"
                height={840}
                sizes="(max-width: 960px) 100vw, 46vw"
                src="/341463.jpg"
                width={1120}
              />
              <ArcStack className="site-about-arc" />
              <dl className="site-about-facts">
                <div>
                  <dt>Established</dt>
                  <dd>{school.established}</dd>
                </div>
                <div>
                  <dt>Learners</dt>
                  <dd>640</dd>
                </div>
                <div>
                  <dt>Teachers</dt>
                  <dd>48</dd>
                </div>
              </dl>
            </div>
          </Reveal>
        </section>

        {/* -- Academics ---------------------------------------------------- */}
        <section className="site-academics" id="academics">
          <Reveal className="site-section-head">
            <p className="site-kicker" data-reveal>
              Academics
            </p>
            <h2 data-reveal>Three stages, one continuous record.</h2>
            <p className="site-lead" data-reveal>
              A child who joins us in Kindergarten leaves with eleven years of
              marks, reports and teacher comments attached to the same file.
            </p>
          </Reveal>

          <Reveal className="site-programmes">
            {school.programmes.map((programme, position) => (
              <article className="site-programme" key={programme.id}>
                <span className="site-programme-index">
                  {String(position + 1).padStart(2, "0")}
                </span>
                <h3>{programme.name}</h3>
                <p className="site-programme-meta">
                  {programme.years} · {programme.ages}
                </p>
                <p>{programme.summary}</p>
                <ul>
                  {programme.points.map((point) => (
                    <li key={point}>
                      <ChevronBand className="site-programme-tick" />
                      {point}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </Reveal>
        </section>

        {/* -- Student life, as a bento ------------------------------------- */}
        <section className="site-life" id="student-life">
          <Reveal className="site-section-head site-section-head-light">
            <p className="site-kicker" data-reveal>
              Student life
            </p>
            <h2 data-reveal>What the rest of the timetable looks like.</h2>
          </Reveal>

          <Reveal className="site-bento" stagger={0.07}>
            <article className="site-bento-tile site-bento-mural">
              <Image
                alt="The mural painted by Greenfield pupils along the assembly ground"
                height={720}
                sizes="(max-width: 900px) 100vw, 58vw"
                src="/5641.jpg"
                width={1280}
              />
              <div>
                <p className="site-kicker">Creative arts</p>
                <h3>The courtyard mural</h3>
                <p>
                  Designed and painted by upper primary and JHS pupils over one
                  term. It stays on the assembly wall.
                </p>
              </div>
            </article>

            <article className="site-bento-tile site-bento-stat">
              <RingAccent className="site-bento-ring" />
              <strong>21</strong>
              <span>clubs and teams, from coding to the drumming ensemble</span>
            </article>

            <article className="site-bento-tile site-bento-quote">
              <p>&ldquo;{school.testimonials[0].quote}&rdquo;</p>
              <footer>
                <strong>{school.testimonials[0].name}</strong>
                <small>{school.testimonials[0].role}</small>
              </footer>
            </article>

            <article className="site-bento-tile site-bento-portrait">
              <Image
                alt="A Greenfield pupil carrying her folder across the courtyard"
                height={900}
                sizes="(max-width: 900px) 50vw, 26vw"
                src="/341343.jpg"
                width={600}
              />
            </article>

            <article className="site-bento-tile site-bento-list">
              <h3>On the timetable</h3>
              <ul>
                <li>Twi and Ga from Primary 1</li>
                <li>Creative arts, weekly</li>
                <li>Swimming and athletics</li>
                <li>Coding club, JHS 1–3</li>
              </ul>
            </article>

            <article className="site-bento-tile site-bento-paint">
              <Image
                alt="A Greenfield pupil painting in the creative arts studio"
                height={640}
                sizes="(max-width: 900px) 50vw, 30vw"
                src="/227646.jpg"
                width={640}
              />
              <span>Creative arts studio</span>
            </article>
          </Reveal>
        </section>

        {/* -- News --------------------------------------------------------- */}
        <section className="site-news" id="news">
          <Reveal className="site-section-head">
            <p className="site-kicker" data-reveal>
              News and events
            </p>
            <h2 data-reveal>From the school office.</h2>
          </Reveal>

          <Reveal className="site-news-grid">
            {school.news.map((item) => (
              <Link className="site-news-card" href={item.href} key={item.id}>
                <p className="site-news-meta">
                  <span>{item.category}</span>
                  <time dateTime={item.date}>{formatDate(item.date)}</time>
                </p>
                <h3>{item.title}</h3>
                <p>{item.summary}</p>
                <span className="site-news-more">
                  Read more
                  <ArrowUpRight aria-hidden="true" size={15} />
                </span>
              </Link>
            ))}
          </Reveal>
        </section>

        {/* -- Admissions --------------------------------------------------- */}
        <section className="site-admissions">
          <ArcStack className="site-admissions-arc" />
          <Reveal className="site-admissions-inner">
            <div className="site-admissions-copy" data-reveal>
              <p className="site-kicker site-kicker-gold">
                {intake.intake?.label ?? "Admissions"}
              </p>
              <h2>
                {intake.isOpen && intake.intake
                  ? `Applications close on ${formatDate(intake.intake.closesOn)}.`
                  : "Applications are closed at the moment."}
              </h2>
              <p>{school.admissions.note}</p>
              <div className="site-admissions-actions">
                <Link className="site-button site-button-gold" href="/admissions">
                  Start an application
                  <ArrowRight aria-hidden="true" size={17} />
                </Link>
                <Link
                  className="site-button site-button-ghost"
                  href={signInPath("/applicant")}
                >
                  Continue a saved application
                </Link>
              </div>
            </div>

            <ol className="site-admissions-steps" data-reveal>
              {school.admissions.steps.map((step, position) => (
                <li key={step.id}>
                  <span>{String(position + 1).padStart(2, "0")}</span>
                  <div>
                    <strong>{step.title}</strong>
                    <small>{step.detail}</small>
                  </div>
                </li>
              ))}
            </ol>
          </Reveal>
        </section>

        {/* -- Visit -------------------------------------------------------- */}
        <section className="site-visit" id="visit">
          <Reveal className="site-visit-inner">
            <div className="site-visit-copy" data-reveal>
              <p className="site-kicker">Visit us</p>
              <h2>Come and see a normal school day.</h2>
              <p>
                We do not stage anything for visitors. Come between 9am and
                11am on a school day, walk the block, and sit in on a lesson.
              </p>
              <ul className="site-visit-details">
                <li>
                  <MapPin aria-hidden="true" size={17} />
                  <span>
                    {school.contact.address.map((line) => (
                      <span key={line}>{line}</span>
                    ))}
                  </span>
                </li>
                <li>
                  <Clock aria-hidden="true" size={17} />
                  <span>{school.contact.officeHours}</span>
                </li>
                <li>
                  <Phone aria-hidden="true" size={17} />
                  <a href={`tel:${school.contact.telephone.replace(/\s/g, "")}`}>
                    {school.contact.telephone}
                  </a>
                </li>
                <li>
                  <Mail aria-hidden="true" size={17} />
                  <a href={`mailto:${school.contact.email}`}>
                    {school.contact.email}
                  </a>
                </li>
              </ul>
            </div>

            <aside className="site-visit-card" data-reveal>
              <CalendarDays aria-hidden="true" size={22} />
              <h3>Open mornings</h3>
              <p>
                Two dates before the intake closes. No appointment needed, but
                telling us you are coming helps us have someone free.
              </p>
              <ul>
                <li>
                  <strong>Saturday 8 August</strong>
                  <span>9:00am – 12:00pm</span>
                </li>
                <li>
                  <strong>Saturday 15 August</strong>
                  <span>9:00am – 12:00pm</span>
                </li>
              </ul>
              <a
                className="site-button site-button-solid"
                href={`mailto:${school.contact.email}?subject=Open%20morning`}
              >
                Tell us you are coming
                <ArrowRight aria-hidden="true" size={17} />
              </a>
            </aside>
          </Reveal>
        </section>
      </main>

      <footer className="site-footer">
        <div className="site-footer-inner">
          <div className="site-footer-brand">
            <BrandMark size={44} />
            <span>
              <strong>{school.name}</strong>
              <small>{school.strapline}</small>
            </span>
          </div>

          <nav aria-label="Footer">
            <div>
              <h2>School</h2>
              <a href="#about">About</a>
              <a href="#academics">Academics</a>
              <a href="#student-life">Student life</a>
              <a href="#news">News</a>
            </div>
            <div>
              <h2>Admissions</h2>
              <Link href="/admissions">How to apply</Link>
              <Link href={signInPath("/applicant")}>Saved application</Link>
              <a href="#visit">Open mornings</a>
            </div>
            <div>
              <h2>Contact</h2>
              <a href={`tel:${school.contact.telephone.replace(/\s/g, "")}`}>
                {school.contact.telephone}
              </a>
              <a href={`mailto:${school.contact.email}`}>
                {school.contact.email}
              </a>
              <span>{school.contact.address.join(", ")}</span>
            </div>
          </nav>
        </div>

        <div className="site-footer-base">
          <p>
            © {new Date().getFullYear()} {school.name}. Running on Learners Hub.
          </p>
          <Link href={signInHref}>{signInLabel}</Link>
        </div>
      </footer>
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
    year: "numeric",
  }).format(new Date(value));
}
