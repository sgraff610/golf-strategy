import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "greenlight",
    short_name: "greenlight",
    description: "Golf strategy and round tracking",
    start_url: "/",
    display: "standalone",
    background_color: "#eef1f4",
    theme_color: "#0f6e56",
    icons: [
      {
        src: "/brand/green-light-mark.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
