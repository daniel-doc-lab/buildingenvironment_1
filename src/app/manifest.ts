import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Fluks – fakturaer og betalinger",
    short_name: "Fluks",
    description: "Godkend og betal fakturaer på sekunder.",
    start_url: "/app",
    display: "standalone",
    background_color: "#f5f7f6",
    theme_color: "#0b6b4f",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
    shortcuts: [
      { name: "Godkendelser", url: "/app/approvals" },
      { name: "Nyt udlæg", url: "/app/expenses?new=1" },
    ],
  };
}
