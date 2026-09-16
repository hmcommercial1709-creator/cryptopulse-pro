export interface PositionRiskInput {
  balance: number;
  riskPercent: number;
  entry: number;
  stopLoss: number;
}

export interface PositionRiskResult {
  maxLoss: number;
  stopDistance: number;
  suggestedUnits: number;
}

export function calculatePositionRisk(input: PositionRiskInput): PositionRiskResult {
  if (input.balance <= 0 || input.riskPercent <= 0 || input.entry <= 0 || input.stopLoss <= 0) {
    throw new Error('All risk inputs must be positive.');
  }
  const maxLoss = input.balance * (input.riskPercent / 100);
  const stopDistance = Math.abs(input.entry - input.stopLoss);
  if (stopDistance === 0) throw new Error('Entry and stop-loss cannot be equal.');
  return { maxLoss, stopDistance, suggestedUnits: maxLoss / stopDistance };
}
