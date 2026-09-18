import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // The review token lives in this URL — never leak it via Referer on
        // outbound clicks (SECURITY-REVIEW.md, tokens section).
        source: "/review/:token*",
        headers: [{ key: "Referrer-Policy", value: "no-referrer" }],
      },
    ];
  },
};

export default nextConfig;
