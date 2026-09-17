export type ExchangeId = 'binance' | 'bybit' | 'okx' | 'kraken';
export type OrderSide = 'BUY' | 'SELL';
export type OrderType = 'MARKET' | 'LIMIT' | 'STOP_LIMIT' | 'STOP_MARKET';

export interface ExchangeCredentials {
  apiKey: string;
  apiSecret: string;
  passphrase?: string;
}

export interface UserExchangeConnection {
  userId: string;
  exchange: ExchangeId;
  credentials: ExchangeCredentials;
  live: boolean;
}

export interface OrderRequest {
  symbol: string;
  side: OrderSide;
  type: OrderType;
  quantity: string;
  price?: string;
  stopPrice?: string;
  clientOrderId?: string;
}

export interface OrderResult {
  exchange: ExchangeId;
  orderId: string;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  status: string;
  executedQuantity: string;
  averagePrice?: string;
}

export interface Position {
  symbol: string;
  quantity: string;
  entryPrice?: string;
  unrealizedPnl?: string;
}

export interface ExchangeAdapter {
  readonly id: ExchangeId;
  validateConnection(credentials: ExchangeCredentials, live: boolean): Promise<void>;
  getBalance(credentials: ExchangeCredentials, live: boolean): Promise<Record<string, string>>;
  placeOrder(credentials: ExchangeCredentials, live: boolean, request: OrderRequest): Promise<OrderResult>;
  cancelOrder(credentials: ExchangeCredentials, live: boolean, symbol: string, orderId: string): Promise<void>;
}
