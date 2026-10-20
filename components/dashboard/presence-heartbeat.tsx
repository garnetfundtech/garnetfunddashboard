"use client";

import { useEffect } from "react";

export function PresenceHeartbeat() {
  useEffect(() => {
    let cancelled = false;

    async function ping() {
      // A background tab is not someone at the dashboard, and pinging from
      // every forgotten tab was the largest share of the function CPU budget.
      if (cancelled || document.hidden) return;
      try {
        await fetch("/api/presence/heartbeat", {
          method: "POST",
          keepalive: true,
          headers: { "Content-Type": "application/json" },
        });
      } catch {
        // Ignore transient network errors.
      }
    }

    // Comfortably inside the 2-minute "online" window in lib/data.ts.
    const interval = setInterval(ping, 60_000);
    const onVisible = () => {
      if (!document.hidden) {
        void ping();
      }
    };

    void ping();
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return null;
}
