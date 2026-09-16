export type AlertCondition = 'above' | 'below' | 'change24h';

export interface PriceAlert {
  id: string;
  userId: string;
  symbol: string;
  condition: AlertCondition;
  threshold: number;
  active: boolean;
  createdAt: string;
}

export function isAlertTriggered(alert: PriceAlert, price: number, change24h: number): boolean {
  if (!alert.active) return false;
  if (alert.condition === 'above') return price >= alert.threshold;
  if (alert.condition === 'below') return price <= alert.threshold;
  return Math.abs(change24h) >= Math.abs(alert.threshold);
}
