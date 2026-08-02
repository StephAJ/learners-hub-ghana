"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import gsap from "gsap";
import type { HeroSlide } from "../../../domain/school/public-profile";

const SLIDE_DURATION = 7000;

/**
 * The hero carousel.
 *
 * Every slide stays mounted so the crossfade has something to fade between,
 * which means the inactive ones have to be taken out of the accessibility tree
 * and out of the tab order — `inert` does both, and without it a keyboard user
 * tabs into three headlines they cannot see.
 *
 * Autoplay is a courtesy, not a requirement: it stops on hover, on focus, when
 * the tab is hidden, and permanently the moment someone works the controls
 * themselves. Under `prefers-reduced-motion` it never starts, and the slide
 * change is a cut rather than a move.
 */
export function HeroCarousel({ slides }: { slides: HeroSlide[] }) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [hovered, setHovered] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLSpanElement>(null);
  /* Set once a person uses the controls; autoplay never resumes after that. */
  const takenOverRef = useRef(false);

  const total = slides.length;
  const goTo = useCallback(
    (next: number) => setIndex(((next % total) + total) % total),
    [total],
  );

  function handOver(next: number) {
    takenOverRef.current = true;
    setPlaying(false);
    goTo(next);
  }

  /* Slide transition. gsap.matchMedia gives us the reduced-motion branch and
     the cleanup for free — reverting the context also resets any inline
     transforms it wrote, so a slide never gets stuck mid-animation. */
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const media = gsap.matchMedia();
    const active = root.querySelector<HTMLElement>(`[data-slide="${index}"]`);
    if (!active) return;

    media.add(
      {
        motion: "(prefers-reduced-motion: no-preference)",
        still: "(prefers-reduced-motion: reduce)",
      },
      (context) => {
        const { motion } = context.conditions as { motion: boolean };
        const image = active.querySelector(".site-hero-image");
        const lines = active.querySelectorAll("[data-hero-line]");

        if (!motion) {
          gsap.set([image, ...Array.from(lines)], { clearProps: "all" });
          return;
        }

        const timeline = gsap.timeline();
        timeline.fromTo(
          image,
          { scale: 1.08 },
          { duration: 7, ease: "none", scale: 1 },
          0,
        );
        timeline.fromTo(
          lines,
          { autoAlpha: 0, y: 22 },
          {
            autoAlpha: 1,
            duration: 0.65,
            ease: "power3.out",
            stagger: 0.08,
            y: 0,
          },
          0.05,
        );
      },
    );

    return () => media.revert();
  }, [index]);

  /* Autoplay, driven by the progress bar itself so the bar can never disagree
     with when the slide actually turns. */
  useEffect(() => {
    if (!playing || hovered || takenOverRef.current) return;
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const bar = progressRef.current;
    const advance = () => goTo(index + 1);

    if (!bar) {
      const timer = window.setTimeout(advance, SLIDE_DURATION);
      return () => window.clearTimeout(timer);
    }

    const tween = gsap.fromTo(
      bar,
      { scaleX: 0 },
      {
        duration: SLIDE_DURATION / 1000,
        ease: "none",
        onComplete: advance,
        scaleX: 1,
      },
    );
    return () => {
      tween.kill();
      gsap.set(bar, { scaleX: 0 });
    };
  }, [goTo, hovered, index, playing]);

  /* A carousel that keeps turning in a background tab is just wasted battery. */
  useEffect(() => {
    function onVisibility() {
      setHovered(document.visibilityState === "hidden");
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const slide = slides[index];

  return (
    <section
      aria-label={`${slides.length} highlights from the school`}
      aria-roledescription="carousel"
      className="site-hero"
      onBlur={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      ref={rootRef}
    >
      <div className="site-hero-stage">
        {slides.map((item, position) => {
          const isActive = position === index;
          return (
            <article
              aria-hidden={!isActive}
              aria-label={`${position + 1} of ${slides.length}`}
              aria-roledescription="slide"
              className={`site-hero-slide${isActive ? " is-active" : ""}`}
              data-slide={position}
              inert={!isActive}
              key={item.id}
            >
              <Image
                alt={item.image.alt}
                className="site-hero-image"
                fill
                priority={position === 0}
                sizes="100vw"
                src={item.image.src}
              />
              <div className="site-hero-scrim" />

              <div className="site-hero-copy">
                <p className="site-hero-eyebrow" data-hero-line>
                  {item.eyebrow}
                </p>
                <h1 data-hero-line>{item.headline}</h1>
                <p className="site-hero-body" data-hero-line>
                  {item.body}
                </p>
                <div className="site-hero-actions" data-hero-line>
                  <Link className="site-button site-button-gold" href="/admissions">
                    Apply for admission
                    <ArrowRight aria-hidden="true" size={17} />
                  </Link>
                  <a className="site-button site-button-ghost" href="#visit">
                    Book a campus visit
                  </a>
                </div>
              </div>

              <div className="site-hero-stat" data-hero-line>
                <strong>{item.stat.value}</strong>
                <span>{item.stat.label}</span>
              </div>
            </article>
          );
        })}
      </div>

      <div className="site-hero-controls">
        <div className="site-hero-arrows">
          <button
            aria-label="Previous slide"
            onClick={() => handOver(index - 1)}
            type="button"
          >
            <ChevronLeft aria-hidden="true" size={18} />
          </button>
          <button
            aria-label="Next slide"
            onClick={() => handOver(index + 1)}
            type="button"
          >
            <ChevronRight aria-hidden="true" size={18} />
          </button>
          <button
            aria-label={playing ? "Pause the carousel" : "Play the carousel"}
            onClick={() => {
              takenOverRef.current = playing;
              setPlaying((current) => !current);
            }}
            type="button"
          >
            {playing ? (
              <Pause aria-hidden="true" size={16} />
            ) : (
              <Play aria-hidden="true" size={16} />
            )}
          </button>
        </div>

        <div className="site-hero-dots" role="tablist">
          {slides.map((item, position) => (
            <button
              aria-current={position === index}
              aria-label={item.headline}
              className={position === index ? "is-active" : undefined}
              key={item.id}
              onClick={() => handOver(position)}
              type="button"
            />
          ))}
        </div>

        <span className="site-hero-progress" aria-hidden="true">
          <span ref={progressRef} />
        </span>
      </div>

      {/* Announces the change for screen readers without moving focus. */}
      <p className="site-visually-hidden" role="status">
        {`Slide ${index + 1} of ${slides.length}: ${slide.headline}`}
      </p>
    </section>
  );
}
