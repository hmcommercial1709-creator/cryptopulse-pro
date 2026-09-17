import type { AgentContext, AgentResult } from './agent-types.js';

export function assessRisk(context: AgentContext): AgentResult {
  const findings = [];
  let score = 100;

  if (context.volumeSpikePct >= 500) {
    score -= 35;
    findings.push({ code: 'extreme_volume_spike', message: 'Volume spike is unusually large relative to the previous observation.', severity: 'high' as const });
  } else if (context.volumeSpikePct >= 200) {
    score -= 20;
    findings.push({ code: 'large_volume_spike', message: 'Large volume spike requires additional review.', severity: 'medium' as const });
  }

  if (context.change24h <= -15) {
    score -= 30;
    findings.push({ code: 'sharp_24h_drawdown', message: '24h price change shows a sharp drawdown.', severity: 'high' as const });
  } else if (context.change24h < -7) {
    score -= 15;
    findings.push({ code: 'negative_24h_momentum', message: '24h price change is materially negative.', severity: 'medium' as const });
  }

  if (!Number.isFinite(context.price) || context.price <= 0 || !Number.isFinite(context.volume24h) || context.volume24h <= 0) {
    findings.push({ code: 'invalid_market_data', message: 'Required market values are unavailable or invalid.', severity: 'high' as const });
    return { agent: 'risk', status: 'blocked', score: null, confidence: 100, findings, dataSource: 'market-snapshot' };
  }

  return {
    agent: 'risk',
    status: score < 60 ? 'warning' : 'ok',
    score: Math.max(0, score),
    confidence: 85,
    findings,
    dataSource: 'market-snapshot',
  };
}
