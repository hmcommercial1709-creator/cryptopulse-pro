export type SwarmAction = 'scan' | 'analyze' | 'prepare';

export type SwarmContext = {
  symbols: string[];
  chains: string[];
  amountUsd?: number;
  action: SwarmAction;
};

export type AgentFinding = {
  agent: 'risk' | 'liquidity' | 'execution';
  status: 'ready' | 'partial' | 'unavailable';
  score?: number;
  title: string;
  details: string[];
  evidence: Record<string, string | number | boolean | null>;
};

export type SwarmReport = {
  generatedAt: string;
  context: SwarmContext;
  findings: AgentFinding[];
  committee: {
    status: 'ready' | 'partial';
    summary: string;
    confidence: number;
    blockers: string[];
  };
};
