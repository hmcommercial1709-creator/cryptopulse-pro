import type { AgentContext, AgentResult } from './agent-types.js';

export function assessMomentum(context: AgentContext): AgentResult {
  const score = Math.max(0, Math.min(100, context.momentumScore));
  const status = score >= 60 ? 'ok' : score >= 35 ? 'warning' : 'warning';
  return {
    agent: 'momentum',
    status,
    score,
    confidence: Math.min(95, Math.max(40, score)),
    findings: [{
      code: score >= 60 ? 'strong_momentum' : 'screening_signal',
      message: `Momentum score is ${score.toFixed(1)} based on the configured volume and 24h-price model.`,
      severity: score >= 60 ? 'info' : 'low',
    }],
    dataSource: 'momentum-model',
  };
}
