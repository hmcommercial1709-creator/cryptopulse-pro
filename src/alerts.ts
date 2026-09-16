export interface PriceAlert {
  id: string;
  userId: string;
  symbol: string;
  operator: 'above' | 'below';
  targetPrice: number;
  active: boolean;
  createdAt: string;
}

export function isTriggered(alert: PriceAlert, price: number): boolean {
  if (!alert.active) return false;
  return alert.operator === 'above' ? price >= alert.targetPrice : price <= alert.targetPrice;
}
