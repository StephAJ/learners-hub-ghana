"use client";

import { useEffect, useRef, type ElementType, type ReactNode } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

/**
 * Reveals its children as they scroll into view.
 *
 * The children start visible in the markup and are hidden by the animation
 * only once it is confirmed to be running — otherwise a failed script or a
 * bot with no layout leaves the page permanently blank, which is the usual way
 * scroll reveals break. Under `prefers-reduced-motion` nothing is touched at
 * all, so the content is simply there.
 */
export function Reveal({
  as,
  children,
  className,
  id,
  stagger = 0.09,
}: {
  as?: ElementType;
  children: ReactNode;
  className?: string;
  id?: string;
  stagger?: number;
}) {
  const ref = useRef<HTMLElement>(null);
  const Tag = (as ?? "div") as ElementType;

  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    const media = gsap.matchMedia();
    media.add("(prefers-reduced-motion: no-preference)", () => {
      /* Opt-in targets first, so a section can nominate exactly what moves;
         otherwise every direct child moves as a group. */
      const marked = root.querySelectorAll<HTMLElement>("[data-reveal]");
      const targets = marked.length
        ? Array.from(marked)
        : Array.from(root.children as HTMLCollectionOf<HTMLElement>);
      if (targets.length === 0) return;

      const tween = gsap.fromTo(
        targets,
        { autoAlpha: 0, y: 26 },
        {
          autoAlpha: 1,
          duration: 0.7,
          ease: "power3.out",
          scrollTrigger: { once: true, start: "top 85%", trigger: root },
          stagger,
          y: 0,
        },
      );
      return () => {
        tween.scrollTrigger?.kill();
        tween.kill();
      };
    });

    return () => media.revert();
  }, [stagger]);

  return (
    <Tag className={className} id={id} ref={ref}>
      {children}
    </Tag>
  );
}
