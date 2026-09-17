import type { AgentContext, AgentResult } from './agent-types.js';

export function assessLiquidity(context: AgentContext): AgentResult {
  if (!Number.isFinite(context.volume24h) || context.volume24h <= 0) {
    return {
      agent: 'liquidity', status: 'unavailable', score: null, confidence: 100,
      findings: [{ code: 'liquidity_data_unavailable', message: 'No reliable order-book or pool-depth feed is configured; liquidity cannot be inferred safely.', severity: 'high' }],
      dataSource: 'none',
    };
  }

  const minVolume = Number(process.env.LIQUIDITY_MIN_24H_USD ?? 1_000_000);
  const score = Math.max(0, Math.min(100, (context.volume24h / minVolume) * 50));
  const findings = [{
    code: context.volume24h >= minVolume ? 'volume_supports_liquidity' : 'low_reported_volume',
    message: context.volume24h >= minVolume
      ? '24h reported volume meets the configured screening threshold; this is not a substitute for pool/order-book depth.'
      : '24h reported volume is below the configured screening threshold.',
    severity: context.volume24h >= minVolume ? 'info' as const : 'medium' as const,
  }];

  return {
    agent: 'liquidity',
    status: context.volume24h >= minVolume ? 'warning' : 'warning',
    score: Math.round(score * 10) / 10,
    confidence: 55,
    findings,
    dataSource: 'market-24h-volume',
  };
}
