import { getMarketSnapshot } from '../market.js';

export interface ScannerEvent { symbol: string; price: number; change24h: number; reason: 'momentum' | 'volume-spike' | 'sudden-move'; }
export interface StrategyDecision { action: 'BUY' | 'SELL' | 'HOLD'; symbol: string; quoteAmount?: number; stopLossPct?: number; takeProfitPct?: number; }
export interface AutomationUser { userId: string; symbols: string[]; autoTradingEnabled: boolean; strategyId?: string; }

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function scanSymbol(symbol: string): Promise<ScannerEvent> {
  const snapshot = await getMarketSnapshot(symbol);
  if (!Number.isFinite(snapshot.price) || snapshot.price <= 0 || !Number.isFinite(snapshot.change24h)) throw new Error(`Invalid market snapshot for ${symbol}`);
  const absChange = Math.abs(snapshot.change24h);
  const reason = absChange >= 8 ? 'sudden-move' : absChange >= 3 ? 'momentum' : 'volume-spike';
  return { symbol: symbol.toUpperCase(), price: snapshot.price, change24h: snapshot.change24h, reason };
}

export function evaluateStrategy(event: ScannerEvent, strategyId = 'momentum-v1'): StrategyDecision {
  if (strategyId === 'momentum-v1' && event.change24h >= 3) return { action: 'BUY', symbol: event.symbol, stopLossPct: 2, takeProfitPct: 5 };
  if (strategyId === 'momentum-v1' && event.change24h <= -5) return { action: 'SELL', symbol: event.symbol, stopLossPct: 2, takeProfitPct: 5 };
  return { action: 'HOLD', symbol: event.symbol };
}

export async function runAutomationCycle(users: AutomationUser[]): Promise<StrategyDecision[]> {
  const decisions: StrategyDecision[] = [];
  for (const user of users) {
    if (!user.autoTradingEnabled) continue;
    const symbols = [...new Set(user.symbols.map((s) => s.trim().toUpperCase()).filter(Boolean))];
    const results = await Promise.allSettled(symbols.map((symbol) => scanSymbol(symbol)));
    for (const result of results) if (result.status === 'fulfilled') decisions.push(evaluateStrategy(result.value, user.strategyId));
  }
  return decisions;
}

export interface WorkerOptions { intervalMs?: number; maxConsecutiveFailures?: number; onCycle?: () => Promise<AutomationUser[]>; onDecision?: (user: AutomationUser, decision: StrategyDecision) => Promise<void>; onError?: (error: unknown) => Promise<void> | void; }

export async function runAutomationWorker(options: WorkerOptions): Promise<never> {
  const intervalMs = Math.max(5_000, options.intervalMs ?? 15_000);
  const maxFailures = Math.max(1, options.maxConsecutiveFailures ?? 5);
  let failures = 0;
  for (;;) {
    try {
      const users = options.onCycle ? await options.onCycle() : [];
      for (const user of users) {
        if (!user.autoTradingEnabled) continue;
        const decisions = await runAutomationCycle([user]);
        for (const decision of decisions) if (decision.action !== 'HOLD' && options.onDecision) await options.onDecision(user, decision);
      }
      failures = 0;
    } catch (error) {
      failures += 1;
      await options.onError?.(error);
      const backoff = Math.min(intervalMs * 2 ** Math.min(failures, 5), 120_000);
      await sleep(backoff);
      if (failures >= maxFailures) failures = 0; // remain alive; execution layer must enforce its own circuit breaker
    }
    await sleep(intervalMs);
  }
}
