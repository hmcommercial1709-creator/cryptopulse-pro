export interface PaperOrder {
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  quantity: number;
  entryPrice: number;
  stopLoss?: number;
  takeProfit?: number;
  status: 'open' | 'closed';
  openedAt: string;
  closedAt?: string;
  exitPrice?: number;
  realizedPnl?: number;
}

export class PaperBroker {
  private readonly orders = new Map<string, PaperOrder>();

  constructor(private balance: number) {
    if (balance <= 0) throw new Error('Paper balance must be positive.');
  }

  place(order: Omit<PaperOrder, 'id' | 'status' | 'openedAt'>): PaperOrder {
    if (order.quantity <= 0 || order.entryPrice <= 0) throw new Error('Quantity and entry price must be positive.');
    const cost = order.quantity * order.entryPrice;
    if (order.side === 'buy' && cost > this.balance) throw new Error('Insufficient paper balance.');
    if (order.side === 'buy') this.balance -= cost;
    const created: PaperOrder = { ...order, id: crypto.randomUUID(), status: 'open', openedAt: new Date().toISOString() };
    this.orders.set(created.id, created);
    return created;
  }

  close(id: string, exitPrice: number): PaperOrder {
    const order = this.orders.get(id);
    if (!order || order.status !== 'open') throw new Error('Open paper order not found.');
    if (exitPrice <= 0) throw new Error('Exit price must be positive.');
    const direction = order.side === 'buy' ? 1 : -1;
    const pnl = (exitPrice - order.entryPrice) * order.quantity * direction;
    if (order.side === 'sell') this.balance += order.quantity * order.entryPrice + pnl;
    else this.balance += order.quantity * exitPrice;
    const closed = { ...order, status: 'closed' as const, closedAt: new Date().toISOString(), exitPrice, realizedPnl: pnl };
    this.orders.set(id, closed);
    return closed;
  }

  getBalance(): number { return this.balance; }
  listOpen(): PaperOrder[] { return [...this.orders.values()].filter((order) => order.status === 'open'); }
  listAll(): PaperOrder[] { return [...this.orders.values()]; }
}
