import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Learners Hub",
    short_name: "Learners Hub",
    description:
      "A class-first learning and school management platform for Ghanaian schools.",
    start_url: "/",
    display: "standalone",
    background_color: "#f3f5ef",
    /* One 768px square source, declared twice: once as-is, and once as
       maskable so a launcher may crop it to its own shape. The mark has
       enough clear space around it to survive that crop. */
    icons: [
      {
        purpose: "any",
        sizes: "768x768",
        src: "/learners-hub-logo.png",
        type: "image/png",
      },
      {
        purpose: "maskable",
        sizes: "768x768",
        src: "/learners-hub-logo.png",
        type: "image/png",
      },
    ],
    theme_color: "#0d5f55",
  };
}
