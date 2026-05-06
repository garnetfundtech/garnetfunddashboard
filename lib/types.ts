export type UserRole = "developer" | "admin" | "analyst";

export type MetricCard = {
  label: string;
  value: string;
  delta: string;
  positive: boolean;
};

export type PerformancePoint = {
  date: string;
  portfolio: number;
  benchmark: number;
};

export type HoldingRow = {
  ticker: string;
  name: string;
  sector: string;
  day1: string;
  day5: string;
  month1: string;
  month3: string;
  month6: string;
  year1: string;
  ytd: string;
  annualized: string;
};

export type ResearchItem = {
  id: string;
  title: string;
  author: string;
  ticker: string;
  updatedAt: string;
  confidence: "high" | "medium" | "low";
  filePath?: string;
  viewUrl?: string;
};

export type ResourceItem = {
  id: string;
  title: string;
  category: "training" | "pitch" | "playbook";
  downloadEnabled: boolean;
  updatedAt: string;
};

export type FundUser = {
  id: string;
  fullName: string;
  role: UserRole;
  isOnline: boolean;
  lastSeenAt: string | null;
};
