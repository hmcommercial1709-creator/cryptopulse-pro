export type AgentStatus = 'ok' | 'warning' | 'blocked' | 'unavailable';

export type AgentFinding = {
  code: string;
  message: string;
  severity: 'info' | 'low' | 'medium' | 'high';
};

export type AgentContext = {
  symbol: string;
  price: number;
  change24h: number;
  volume24h: number;
  volumeSpikePct: number;
  momentumScore: number;
  observedAt: string;
};

export type AgentResult = {
  agent: 'risk' | 'liquidity' | 'momentum';
  status: AgentStatus;
  score: number | null;
  confidence: number | null;
  findings: AgentFinding[];
  dataSource: string;
};

export type CommitteeReport = {
  symbol: string;
  generatedAt: string;
  decision: 'monitor' | 'review' | 'blocked' | 'insufficient_data';
  confidence: number | null;
  agents: AgentResult[];
  summary: string;
  executionAllowed: false;
};
