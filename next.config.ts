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
      // The default is 1 MB, which was small enough that no research deck or
      // scanned article had ever reached storage — and because the framework
      // rejects an oversized body before application code runs, it surfaced
      // as a bare "A server error occurred" page rather than a message.
      //
      // Team files no longer rely on this at all: they upload straight to
      // Supabase Storage via a signed URL and only a small JSON payload comes
      // back through an action (see app/api/files/upload-url). This limit now
      // governs research uploads, which still carry their bytes inside the
      // request, and it cannot usefully go above ~4.5 MB because that is
      // Vercel's own function body cap.
      //
      // Keep in step with MAX_ACTION_UPLOAD_BYTES in lib/uploads.ts.
      bodySizeLimit: "4mb",
    },
  },
};

export default nextConfig;
