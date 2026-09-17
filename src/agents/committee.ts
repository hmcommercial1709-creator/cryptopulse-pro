import { assessLiquidity } from './liquidity-agent.js';
import { assessMomentum } from './momentum-agent.js';
import { assessRisk } from './risk-agent.js';
import type { AgentContext, AgentResult, CommitteeReport } from './agent-types.js';

export function buildCommitteeReport(context: AgentContext): CommitteeReport {
  const agents: AgentResult[] = [assessRisk(context), assessLiquidity(context), assessMomentum(context)];
  const blocked = agents.some((agent) => agent.status === 'blocked');
  const unavailable = agents.some((agent) => agent.status === 'unavailable');
  const numericScores = agents.map((agent) => agent.score).filter((score): score is number => score !== null);
  const confidences = agents.map((agent) => agent.confidence).filter((value): value is number => value !== null);
  const confidence = confidences.length ? Math.round((confidences.reduce((a, b) => a + b, 0) / confidences.length) * 10) / 10 : null;
  const aggregate = numericScores.length ? numericScores.reduce((a, b) => a + b, 0) / numericScores.length : null;

  const decision = blocked ? 'blocked' : unavailable ? 'insufficient_data' : aggregate !== null && aggregate >= 70 ? 'review' : 'monitor';
  const summary = blocked
    ? 'Committee blocked the signal because required market data failed validation.'
    : unavailable
      ? 'Committee requires additional data before making a meaningful assessment.'
      : `Committee classified ${context.symbol} as ${decision}; execution remains disabled.`;

  return {
    symbol: context.symbol,
    generatedAt: new Date().toISOString(),
    decision,
    confidence,
    agents,
    summary,
    executionAllowed: false,
  };
}
