import { readFileSync } from "node:fs";

// Client JS a first visit to "/" downloads, taken from the last `next build`
// (.next/diagnostics/route-bundle-stats.json). Run `npm run build` first.
const stats = JSON.parse(readFileSync(new URL(".next/diagnostics/route-bundle-stats.json", import.meta.url), "utf8"));
const home = stats.find((r) => r.route === "/");
if (!home) throw new Error("route / not found in route-bundle-stats.json");

const budgets = [
  {
    name: "/ first-load client JS (brotli)",
    path: home.firstLoadChunkPaths,
    limit: "180 kB",
  },
];

export default budgets;
