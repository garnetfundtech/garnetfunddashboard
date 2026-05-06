import {
  HoldingRow,
  MetricCard,
  PerformancePoint,
  ResearchItem,
  ResourceItem,
} from "@/lib/types";

export const metricCards: MetricCard[] = [
  { label: "Total AUM", value: "$0", delta: "0.0% MTD", positive: true },
  { label: "Portfolio Beta", value: "0.00", delta: "0.00 vs S&P", positive: true },
  {
    label: "YTD Performance",
    value: "0.00%",
    delta: "0.0% vs benchmark",
    positive: true,
  },
  { label: "Cash Weight", value: "0.0%", delta: "0.0% W/W", positive: true },
];

export const performanceSeries: PerformancePoint[] = [
  { date: "Jan", portfolio: 0, benchmark: 0 },
  { date: "Feb", portfolio: 0, benchmark: 0 },
  { date: "Mar", portfolio: 0, benchmark: 0 },
  { date: "Apr", portfolio: 0, benchmark: 0 },
  { date: "May", portfolio: 0, benchmark: 0 },
  { date: "Jun", portfolio: 0, benchmark: 0 },
  { date: "Jul", portfolio: 0, benchmark: 0 },
];

export const holdings: HoldingRow[] = [
  {
    ticker: "AAPL",
    name: "Apple Inc.",
    sector: "Technology",
    day1: "0.0%",
    day5: "0.0%",
    month1: "0.0%",
    month3: "0.0%",
    month6: "0.0%",
    year1: "0.0%",
    ytd: "0.0%",
    annualized: "0.0%",
  },
  {
    ticker: "MSFT",
    name: "Microsoft Corp.",
    sector: "Technology",
    day1: "0.0%",
    day5: "0.0%",
    month1: "0.0%",
    month3: "0.0%",
    month6: "0.0%",
    year1: "0.0%",
    ytd: "0.0%",
    annualized: "0.0%",
  },
  {
    ticker: "LLY",
    name: "Eli Lilly and Co.",
    sector: "Healthcare",
    day1: "0.0%",
    day5: "0.0%",
    month1: "0.0%",
    month3: "0.0%",
    month6: "0.0%",
    year1: "0.0%",
    ytd: "0.0%",
    annualized: "0.0%",
  },
  {
    ticker: "XOM",
    name: "Exxon Mobil Corp.",
    sector: "Energy",
    day1: "0.0%",
    day5: "0.0%",
    month1: "0.0%",
    month3: "0.0%",
    month6: "0.0%",
    year1: "0.0%",
    ytd: "0.0%",
    annualized: "0.0%",
  },
];

export const researchItems: ResearchItem[] = [
  {
    id: "r1",
    title: "Apple Services Margin Expansion Thesis",
    author: "Preston S.",
    ticker: "AAPL",
    updatedAt: "2h ago",
    confidence: "high",
  },
  {
    id: "r2",
    title: "Healthcare Rotation in a Higher-for-Longer Cycle",
    author: "Jordan W.",
    ticker: "XLV",
    updatedAt: "Yesterday",
    confidence: "medium",
  },
  {
    id: "r3",
    title: "Nvidia Earnings Readthrough for AI Supply Chain",
    author: "Maya R.",
    ticker: "NVDA",
    updatedAt: "3d ago",
    confidence: "high",
  },
];

export const resourceItems: ResourceItem[] = [
  {
    id: "f1",
    title: "Spring Analyst Training Deck",
    category: "training",
    downloadEnabled: false,
    updatedAt: "Apr 14",
  },
  {
    id: "f2",
    title: "Past Pitch: Healthcare Pair Trade",
    category: "pitch",
    downloadEnabled: true,
    updatedAt: "Apr 03",
  },
  {
    id: "f3",
    title: "Research Process Playbook",
    category: "playbook",
    downloadEnabled: false,
    updatedAt: "Mar 21",
  },
];
