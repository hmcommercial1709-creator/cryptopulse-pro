import { getMarketSnapshot } from '../market.js';

export interface ScannerEvent {
  symbol: string;
  price: number;
  change24h: number;
  reason: 'momentum' | 'volume-spike' | 'sudden-move';
}

export interface StrategyDecision {
  action: 'BUY' | 'SELL' | 'HOLD';
  symbol: string;
  quoteAmount?: number;
  stopLossPct?: number;
  takeProfitPct?: number;
}

export interface AutomationUser {
  userId: string;
  symbols: string[];
  autoTradingEnabled: boolean;
  strategyId?: string;
}

/**
 * Background automation boundary.
 * The worker deliberately keeps scanning, strategy evaluation and execution
 * separate so exchange credentials are only touched by the execution layer.
 */
export async function scanSymbol(symbol: string): Promise<ScannerEvent> {
  const snapshot = await getMarketSnapshot(symbol);
  const absChange = Math.abs(snapshot.change24h);
  const reason = absChange >= 8 ? 'sudden-move' : absChange >= 3 ? 'momentum' : 'volume-spike';
  return { symbol, price: snapshot.price, change24h: snapshot.change24h, reason };
}

export function evaluateStrategy(event: ScannerEvent, strategyId = 'momentum-v1'): StrategyDecision {
  if (strategyId === 'momentum-v1' && event.change24h >= 3) {
    return { action: 'BUY', symbol: event.symbol, stopLossPct: 2, takeProfitPct: 5 };
  }
  if (strategyId === 'momentum-v1' && event.change24h <= -5) {
    return { action: 'SELL', symbol: event.symbol, stopLossPct: 2, takeProfitPct: 5 };
  }
  return { action: 'HOLD', symbol: event.symbol };
}

export async function runAutomationCycle(users: AutomationUser[]): Promise<StrategyDecision[]> {
  const decisions: StrategyDecision[] = [];
  for (const user of users) {
    if (!user.autoTradingEnabled) continue;
    for (const symbol of user.symbols) {
      const event = await scanSymbol(symbol);
      decisions.push(evaluateStrategy(event, user.strategyId));
    }
  }
  return decisions;
}
