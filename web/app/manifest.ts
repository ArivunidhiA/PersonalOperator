import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Ariv's AI",
    short_name: "Ariv's AI",
    description: "A voice agent that knows Ariv's work.",
    start_url: "/",
    display: "standalone",
    background_color: "#0b0a09",
    theme_color: "#0b0a09",
    icons: [{ src: "/favicon-frame-1.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
