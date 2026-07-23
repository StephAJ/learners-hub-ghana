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
    theme_color: "#0d5f55",
  };
}
