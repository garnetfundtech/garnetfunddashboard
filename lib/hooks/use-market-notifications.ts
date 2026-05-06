"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type NotifKind = "market_open" | "market_close" | "milestone_up" | "milestone_down";

export type Notification = {
  id: string;
  kind: NotifKind;
  title: string;
  body: string;
  ts: string;
};

const STORAGE_KEY = "gft_notifications";
const COOLDOWN_KEY = "gft_notif_cooldowns";
const SESSION_KEY = "gft_last_session";

const THRESHOLDS = [5, 10, 25];
const COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes
const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

type MarketCheckResponse = {
  session: "pre" | "regular" | "post" | "closed";
  isOpen: boolean;
  indices: { symbol: string; label: string; dayPct: number }[];
  positions: { ticker: string; name: string; dayPct: number; allTimePct: number }[];
  fetchedAt: string;
};

function loadNotifs(): Notification[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Notification[]) : [];
  } catch {
    return [];
  }
}

function saveNotifs(notifs: Notification[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notifs));
  } catch {
    // localStorage unavailable (SSR guard)
  }
}

function loadCooldowns(): Record<string, number> {
  try {
    const raw = localStorage.getItem(COOLDOWN_KEY);
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    return {};
  }
}

function saveCooldowns(map: Record<string, number>) {
  try {
    localStorage.setItem(COOLDOWN_KEY, JSON.stringify(map));
  } catch {}
}

function loadLastSession(): string {
  try {
    return localStorage.getItem(SESSION_KEY) ?? "";
  } catch {
    return "";
  }
}

function saveLastSession(s: string) {
  try {
    localStorage.setItem(SESSION_KEY, s);
  } catch {}
}

function isCooledDown(key: string, cooldowns: Record<string, number>): boolean {
  const last = cooldowns[key] ?? 0;
  return Date.now() - last < COOLDOWN_MS;
}

function setFireTime(key: string, cooldowns: Record<string, number>): Record<string, number> {
  return { ...cooldowns, [key]: Date.now() };
}

function genId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildNotifications(
  data: MarketCheckResponse,
  prevSession: string,
  cooldowns: Record<string, number>,
): { newNotifs: Notification[]; updatedCooldowns: Record<string, number> } {
  const newNotifs: Notification[] = [];
  let cd = { ...cooldowns };

  // Market open/close detection
  if (prevSession !== "" && prevSession !== "regular" && data.session === "regular") {
    const key = "session_open";
    if (!isCooledDown(key, cd)) {
      newNotifs.push({
        id: genId(),
        kind: "market_open",
        title: "Market Open",
        body: "Regular trading session is now open. NYSE & NASDAQ are live.",
        ts: data.fetchedAt,
      });
      cd = setFireTime(key, cd);
    }
  }

  if (prevSession === "regular" && data.session !== "regular") {
    const key = "session_close";
    if (!isCooledDown(key, cd)) {
      newNotifs.push({
        id: genId(),
        kind: "market_close",
        title: "Market Close",
        body: "Regular trading session has ended for the day.",
        ts: data.fetchedAt,
      });
      cd = setFireTime(key, cd);
    }
  }

  // Index milestone checks (daily % only)
  for (const idx of data.indices) {
    for (const threshold of THRESHOLDS) {
      if (idx.dayPct >= threshold) {
        const key = `${idx.symbol}_day_${threshold}_up`;
        if (!isCooledDown(key, cd)) {
          newNotifs.push({
            id: genId(),
            kind: "milestone_up",
            title: `${idx.label} +${threshold}% Today`,
            body: `${idx.label} (${idx.symbol}) is up ${idx.dayPct.toFixed(2)}% today, crossing the +${threshold}% threshold.`,
            ts: data.fetchedAt,
          });
          cd = setFireTime(key, cd);
        }
      }
      if (idx.dayPct <= -threshold) {
        const key = `${idx.symbol}_day_${threshold}_down`;
        if (!isCooledDown(key, cd)) {
          newNotifs.push({
            id: genId(),
            kind: "milestone_down",
            title: `${idx.label} -${threshold}% Today`,
            body: `${idx.label} (${idx.symbol}) is down ${Math.abs(idx.dayPct).toFixed(2)}% today, crossing the -${threshold}% threshold.`,
            ts: data.fetchedAt,
          });
          cd = setFireTime(key, cd);
        }
      }
    }
  }

  // Portfolio position milestone checks
  for (const pos of data.positions) {
    for (const threshold of THRESHOLDS) {
      // Daily up
      if (pos.dayPct >= threshold) {
        const key = `${pos.ticker}_day_${threshold}_up`;
        if (!isCooledDown(key, cd)) {
          newNotifs.push({
            id: genId(),
            kind: "milestone_up",
            title: `${pos.ticker} +${threshold}% Today`,
            body: `${pos.name} (${pos.ticker}) is up ${pos.dayPct.toFixed(2)}% today, crossing the +${threshold}% threshold.`,
            ts: data.fetchedAt,
          });
          cd = setFireTime(key, cd);
        }
      }
      // Daily down
      if (pos.dayPct <= -threshold) {
        const key = `${pos.ticker}_day_${threshold}_down`;
        if (!isCooledDown(key, cd)) {
          newNotifs.push({
            id: genId(),
            kind: "milestone_down",
            title: `${pos.ticker} -${threshold}% Today`,
            body: `${pos.name} (${pos.ticker}) is down ${Math.abs(pos.dayPct).toFixed(2)}% today, crossing the -${threshold}% threshold.`,
            ts: data.fetchedAt,
          });
          cd = setFireTime(key, cd);
        }
      }
      // All-time up
      if (pos.allTimePct >= threshold) {
        const key = `${pos.ticker}_alltime_${threshold}_up`;
        if (!isCooledDown(key, cd)) {
          newNotifs.push({
            id: genId(),
            kind: "milestone_up",
            title: `${pos.ticker} +${threshold}% All-Time`,
            body: `${pos.name} (${pos.ticker}) has an unrealized gain of ${pos.allTimePct.toFixed(2)}%, crossing the +${threshold}% threshold.`,
            ts: data.fetchedAt,
          });
          cd = setFireTime(key, cd);
        }
      }
      // All-time down
      if (pos.allTimePct <= -threshold) {
        const key = `${pos.ticker}_alltime_${threshold}_down`;
        if (!isCooledDown(key, cd)) {
          newNotifs.push({
            id: genId(),
            kind: "milestone_down",
            title: `${pos.ticker} -${threshold}% All-Time`,
            body: `${pos.name} (${pos.ticker}) has an unrealized loss of ${Math.abs(pos.allTimePct).toFixed(2)}%, crossing the -${threshold}% threshold.`,
            ts: data.fetchedAt,
          });
          cd = setFireTime(key, cd);
        }
      }
    }
  }

  return { newNotifs, updatedCooldowns: cd };
}

export function useMarketNotifications() {
  const [notifs, setNotifs] = useState<Notification[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(false);

  // Load persisted notifications on first mount
  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;
    setNotifs(loadNotifs());
  }, []);

  const runCheck = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications/market-check", { cache: "no-store" });
      if (!res.ok) return;
      const data: MarketCheckResponse = await res.json();

      const prevSession = loadLastSession();
      const cooldowns = loadCooldowns();
      const { newNotifs, updatedCooldowns } = buildNotifications(data, prevSession, cooldowns);

      saveLastSession(data.session);
      saveCooldowns(updatedCooldowns);

      if (newNotifs.length > 0) {
        setNotifs((prev) => {
          const merged = [...newNotifs, ...prev];
          saveNotifs(merged);
          return merged;
        });
      }
    } catch {
      // Network errors are silent
    }
  }, []);

  // Start polling on mount
  useEffect(() => {
    queueMicrotask(() => {
      void runCheck();
    });
    pollRef.current = setInterval(runCheck, POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [runCheck]);

  const dismiss = useCallback((id: string) => {
    setNotifs((prev) => {
      const next = prev.filter((n) => n.id !== id);
      saveNotifs(next);
      return next;
    });
  }, []);

  const clearAll = useCallback(() => {
    setNotifs([]);
    saveNotifs([]);
  }, []);

  return { notifs, dismiss, clearAll };
}
