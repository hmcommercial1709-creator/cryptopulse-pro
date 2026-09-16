import type { MarketSnapshot } from './domain.js';
import type { TechnicalIndicators } from './indicators.js';

export type MarketBias = 'bullish' | 'neutral' | 'bearish';

export interface MarketAnalysis {
  bias: MarketBias;
  evidenceScore: number;
  reasons: string[];
  riskFlags: string[];
  noTrade: boolean;
}

export function analyzeMarket(snapshot: MarketSnapshot, indicators: TechnicalIndicators): MarketAnalysis {
  let score = 0;
  const reasons: string[] = [];
  const riskFlags: string[] = [];

  if (indicators.ema20 !== null && indicators.ema50 !== null) {
    if (indicators.ema20 > indicators.ema50) {
      score += 2;
      reasons.push('Shorter-term trend is above the longer-term trend.');
    } else if (indicators.ema20 < indicators.ema50) {
      score -= 2;
      reasons.push('Shorter-term trend is below the longer-term trend.');
    }
  }

  if (indicators.rsi14 !== null) {
    if (indicators.rsi14 >= 70) {
      riskFlags.push('Momentum is stretched to the upside (RSI ≥ 70).');
    } else if (indicators.rsi14 <= 30) {
      riskFlags.push('Momentum is stretched to the downside (RSI ≤ 30).');
    } else {
      reasons.push(`RSI is in a middle range (${indicators.rsi14.toFixed(1)}).`);
    }
  }

  if (snapshot.change24h > 0.5) score += 1;
  if (snapshot.change24h < -0.5) score -= 1;

  if (indicators.atr14 === null || indicators.ema20 === null || indicators.rsi14 === null) {
    riskFlags.push('Insufficient historical data for a complete technical assessment.');
  }

  if (indicators.volatility20 !== null && indicators.volatility20 > 1) {
    riskFlags.push('Recent annualized volatility is elevated.');
  }

  const bias: MarketBias = score >= 2 ? 'bullish' : score <= -2 ? 'bearish' : 'neutral';
  const noTrade = riskFlags.some((flag) => flag.startsWith('Insufficient')) || bias === 'neutral';

  return {
    bias,
    evidenceScore: score,
    reasons,
    riskFlags,
    noTrade,
  };
}
