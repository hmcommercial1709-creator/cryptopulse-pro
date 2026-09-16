export interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: string;
}

export interface TechnicalIndicators {
  sma20: number | null;
  ema20: number | null;
  ema50: number | null;
  rsi14: number | null;
  macd: number | null;
  macdSignal: number | null;
  atr14: number | null;
  volatility20: number | null;
  support: number | null;
  resistance: number | null;
}

function average(values: number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

export function sma(values: number[], period: number): number | null {
  if (period <= 0 || values.length < period) return null;
  return average(values.slice(-period));
}

export function ema(values: number[], period: number): number | null {
  if (period <= 0 || values.length < period) return null;
  const multiplier = 2 / (period + 1);
  let result = average(values.slice(0, period));
  if (result === null) return null;
  for (let index = period; index < values.length; index += 1) {
    result = (values[index] - result) * multiplier + result;
  }
  return result;
}

export function rsi(values: number[], period = 14): number | null {
  if (period <= 0 || values.length <= period) return null;
  let gains = 0;
  let losses = 0;
  for (let index = 1; index <= period; index += 1) {
    const delta = values[index] - values[index - 1];
    if (delta >= 0) gains += delta;
    else losses -= delta;
  }
  let averageGain = gains / period;
  let averageLoss = losses / period;
  for (let index = period + 1; index < values.length; index += 1) {
    const delta = values[index] - values[index - 1];
    const gain = Math.max(delta, 0);
    const loss = Math.max(-delta, 0);
    averageGain = ((averageGain * (period - 1)) + gain) / period;
    averageLoss = ((averageLoss * (period - 1)) + loss) / period;
  }
  if (averageLoss === 0) return 100;
  const relativeStrength = averageGain / averageLoss;
  return 100 - (100 / (1 + relativeStrength));
}

export function atr(candles: Candle[], period = 14): number | null {
  if (period <= 0 || candles.length <= period) return null;
  const trueRanges: number[] = [];
  for (let index = 1; index < candles.length; index += 1) {
    const current = candles[index];
    const previous = candles[index - 1];
    trueRanges.push(Math.max(current.high - current.low, Math.abs(current.high - previous.close), Math.abs(current.low - previous.close)));
  }
  return sma(trueRanges, period);
}

export function volatility(values: number[], period = 20): number | null {
  if (period <= 1 || values.length < period) return null;
  const window = values.slice(-period);
  const returns: number[] = [];
  for (let index = 1; index < window.length; index += 1) {
    if (window[index - 1] > 0) returns.push(Math.log(window[index] / window[index - 1]));
  }
  if (returns.length < 2) return null;
  const mean = average(returns) ?? 0;
  const variance = returns.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / (returns.length - 1);
  return Math.sqrt(variance) * Math.sqrt(365);
}

export function calculateIndicators(candles: Candle[]): TechnicalIndicators {
  const closes = candles.map((candle) => candle.close);
  const recent = candles.slice(-20);
  return {
    sma20: sma(closes, 20),
    ema20: ema(closes, 20),
    ema50: ema(closes, 50),
    rsi14: rsi(closes, 14),
    macd: (() => {
      const fast = ema(closes, 12);
      const slow = ema(closes, 26);
      return fast !== null && slow !== null ? fast - slow : null;
    })(),
    macdSignal: null,
    atr14: atr(candles, 14),
    volatility20: volatility(closes, 20),
    support: recent.length ? Math.min(...recent.map((candle) => candle.low)) : null,
    resistance: recent.length ? Math.max(...recent.map((candle) => candle.high)) : null,
  };
}
