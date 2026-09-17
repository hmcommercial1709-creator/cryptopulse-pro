import { supabaseSelect, supabaseUpdate } from '../supabase';
import { getMarketSnapshot } from '../market';

type Alert = {
  id: string;
  user_id: string;
  symbol: string;
  condition: 'above' | 'below';
  target_price: number;
  active: boolean;
  last_triggered_at?: string | null;
};

function isTriggered(alert: Alert, price: number): boolean {
  return alert.condition === 'above' ? price >= alert.target_price : price <= alert.target_price;
}

export async function evaluatePriceAlerts(): Promise<{ checked: number; triggered: number }> {
  const alerts = await supabaseSelect<Alert>('cp_alerts', {
    select: 'id,user_id,symbol,condition,target_price,active,last_triggered_at',
    active: 'eq.true',
    limit: '250',
  });

  let triggered = 0;
  for (const alert of alerts) {
    const market = await getMarketSnapshot(alert.symbol);
    if (!market || !isTriggered(alert, market.price)) continue;

    await supabaseUpdate('cp_alerts', alert.id, {
      active: false,
      last_triggered_at: new Date().toISOString(),
    });
    triggered += 1;
  }

  return { checked: alerts.length, triggered };
}
