import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  // Cache rendered page segments in the client router so switching back to a
  // recently-visited tab is instant instead of a fresh server round-trip.
  experimental: {
    staleTimes: {
      dynamic: 30,
      static: 300,
    },
    serverActions: {
      // No upload depends on this any more. All three surfaces — team files,
      // research and resources — send their bytes straight to Supabase
      // Storage and pass only metadata through an action, because Vercel caps
      // a function request body at 4.5 MB and the stock 1 MB default here was
      // silently failing every real file (see lib/uploads.ts).
      //
      // Kept, raised, as headroom for ordinary form actions: the default 1 MB
      // is easy to trip with a large form payload, and doing so produces the
      // same unexplainable error page rather than a handled error.
      bodySizeLimit: "4mb",
    },
  },
};

export default nextConfig;
