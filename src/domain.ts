export type RiskLevel = 'low' | 'medium' | 'high';

export interface MarketSnapshot {
  symbol: string;
  price: number;
  change24h: number;
  volume24h: number;
  updatedAt: string;
}

export interface TradePlan {
  symbol: string;
  side: 'buy' | 'sell';
  entry: number;
  stopLoss: number;
  takeProfit: number;
  riskLevel: RiskLevel;
  riskReward: number;
  explanation: string;
}

export function buildBeginnerTradePlan(snapshot: MarketSnapshot, riskLevel: RiskLevel): TradePlan {
  const stopPct = riskLevel === 'low' ? 0.015 : riskLevel === 'medium' ? 0.025 : 0.04;
  const targetPct = stopPct * 2;
  const bullish = snapshot.change24h >= 0;
  const side = bullish ? 'buy' : 'sell';
  const entry = snapshot.price;
  const stopLoss = bullish ? entry * (1 - stopPct) : entry * (1 + stopPct);
  const takeProfit = bullish ? entry * (1 + targetPct) : entry * (1 - targetPct);

  return {
    symbol: snapshot.symbol,
    side,
    entry,
    stopLoss,
    takeProfit,
    riskLevel,
    riskReward: 2,
    explanation: `Educational plan based on the current 24h direction. It is not a profit guarantee or personalized financial advice.`,
  };
}
