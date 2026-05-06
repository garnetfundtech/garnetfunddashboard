"use client";

import { useEffect } from "react";

export function usePdfPrint(url?: string) {
  useEffect(() => {}, []);

  return () => {
    if (!url) return;
    const w = window.open(url, "_blank", "noopener,noreferrer");
    if (!w) return;
    const t = window.setInterval(() => {
      try {
        if (w.document?.readyState === "complete") {
          window.clearInterval(t);
          w.focus();
          w.print();
        }
      } catch {
        window.clearInterval(t);
        w.focus();
        w.print();
      }
    }, 400);
    window.setTimeout(() => window.clearInterval(t), 5000);
  };
}
