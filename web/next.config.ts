import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// CSP. script-src uses 'unsafe-inline' instead of nonces on purpose: nonces
// need per-request header injection in middleware.ts (which also forces every
// page to dynamic rendering), and Clerk's ClerkProvider + Next's bootstrap emit
// inline scripts we cannot tag from next.config. 'self' + an explicit host
// allowlist still blocks foreign script origins. Revisit when middleware can
// set a nonce. See docs/checklists/security-headers.md.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://clerk.arivsai.app https://*.clerk.accounts.dev https://challenges.cloudflare.com`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://img.clerk.com",
  "font-src 'self'",
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  `connect-src 'self' wss://generativelanguage.googleapis.com https://clerk.arivsai.app https://*.clerk.accounts.dev https://vitals.vercel-insights.com https://challenges.cloudflare.com${isDev ? " ws://localhost:* http://localhost:*" : ""}`,
  "frame-src https://challenges.cloudflare.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  // Only this site may use the mic; nothing else is needed.
  { key: "Permissions-Policy", value: "microphone=(self), camera=(), geolocation=(), payment=()" },
  // No framing (clickjacking a "Start talking" button would open someone's mic).
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/call/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
    ];
  },
};

export default nextConfig;
