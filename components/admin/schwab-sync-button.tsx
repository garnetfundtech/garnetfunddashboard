"use client";

import { useState } from "react";

export function SchwabSyncButton() {
  const [state, setState] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function runSync() {
    setState("loading");
    setMessage(null);
    try {
      const res = await fetch("/api/schwab/sync", { method: "POST" });
      const json = await res.json();
      if (json.ok) {
        setState("ok");
        setMessage("Sync completed. Refresh the page to see updated results.");
      } else {
        setState("error");
        setMessage(json.message ?? "Sync failed.");
      }
    } catch {
      setState("error");
      setMessage("Network error: could not reach sync endpoint.");
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={runSync}
        disabled={state === "loading"}
        className="rounded-none bg-garnet px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
      >
        {state === "loading" ? "Syncing…" : "Sync Now"}
      </button>
      {message && (
        <span className={`text-xs ${state === "error" ? "text-neg" : "text-pos"}`}>
          {message}
        </span>
      )}
    </div>
  );
}
