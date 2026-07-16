export type UserRole = "developer" | "admin" | "pm" | "analyst";

export type PitchStage =
  | "idea"
  | "in_research"
  | "pitched"
  | "voted"
  | "position"
  | "rejected";

export type ThesisStatus = "active" | "under_review" | "became_position" | "rejected";

export type PitchRow = {
  id: string;
  ticker: string;
  analystId: string;
  analystName: string;
  thesis: string;
  stage: PitchStage;
  researchId: string | null;
  positionSymbol: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WatchlistRow = {
  id: string;
  ticker: string;
  addedBy: string;
  adderName: string;
  pitchId: string | null;
  analystTarget: string | null;
  notes: string | null;
  createdAt: string;
};

// ── Market / Portfolio types ──────────────────────────────────────────────────

export type IndexQuote = {
  symbol: string;
  label: string;
  lastPrice: number;
  change: number;
  pctChange: number;
  high: number;
  low: number;
};

export type MarketSession = "pre" | "regular" | "post" | "closed";

export type MarketOverview = {
  isOpen: boolean;
  session: MarketSession;
  sessionStart: string | null;
  sessionEnd: string | null;
  indices: IndexQuote[];
  gainers: Mover[];
  losers: Mover[];
  fetchedAt: string;
};

export type Mover = {
  symbol?: string;
  description?: string;
  lastPrice?: number;
  change?: number;
  percentChange?: number;
  totalVolume?: number;
  direction?: string;
};

export type LivePosition = {
  ticker: string;
  name: string;
  assetType: string;
  quantity: number;
  avgCost: number;
  currentPrice: number;
  marketValue: number;
  unrealizedPnl: number;
  unrealizedPnlPct: number;
  dayPnl: number;
  dayPnlPct: number;
  weight: number;
  /** Populated when sector data is available (e.g. from FMP) */
  sector?: string;
  /** "long" or "short" — derived from Schwab long/short quantity. Defaults to long. */
  side?: "long" | "short";
};

export type PortfolioSummary = {
  liquidationValue: number;
  cashAvailable: number;
  longMarketValue: number;
  /** Absolute dollar value of the short book (positive). 0 when long-only. */
  shortMarketValue: number;
  /** Longs plus shorts, in dollars — the gross book. */
  grossMarketValue: number;
  /** Longs minus shorts, in dollars — the net book. */
  netMarketValue: number;
  unrealizedPnl: number;
  realizedPnl: number;
  dayPnl: number;
  positionCount: number;
  positions: LivePosition[];
  accountNumber: string | null;
  verifiedAt: string;
};

export type BenchmarkCandle = { date: string; value: number };

export type StoredAnalysis = {
  bull: string;
  bear: string;
  comps: string[];
  sizeRange: string;
};

export type ResearchItem = {
  id: string;
  title: string;
  author: string;
  ticker: string;
  updatedAt: string;
  createdBy: string | null;
  uploaderRole: UserRole;
  filePath?: string;
  viewUrl?: string;
  downloadEnabled: boolean;
  downloadUrl?: string;
  sector: string | null;
  thesisStatus: ThesisStatus;
  analystName: string | null;
  aiAnalysis: StoredAnalysis | null;
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
