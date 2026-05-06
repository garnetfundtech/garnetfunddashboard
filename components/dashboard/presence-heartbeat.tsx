"use client";

import { useEffect } from "react";

export function PresenceHeartbeat() {
  useEffect(() => {
    let cancelled = false;

    async function ping() {
      if (cancelled) return;
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

    const interval = setInterval(ping, 30000);
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
