import { createHmac } from 'node:crypto';

export type OrderSide = 'Buy' | 'Sell';
export type OrderType = 'Market' | 'Limit';

export interface PlaceOrderRequest {
  symbol: string;
  side: OrderSide;
  orderType: OrderType;
  qty: string;
  price?: string;
  takeProfit?: string;
  stopLoss?: string;
  orderLinkId?: string;
}

export interface ExchangeOrderResult {
  exchange: 'bybit';
  orderId: string;
  orderLinkId: string;
  accepted: boolean;
  raw: unknown;
}

export interface ExchangeClient {
  placeSpotOrder(request: PlaceOrderRequest): Promise<ExchangeOrderResult>;
  cancelSpotOrder(symbol: string, orderId: string): Promise<void>;
}

interface BybitResponse<T> {
  retCode: number;
  retMsg: string;
  result: T;
}

function signature(secret: string, timestamp: string, apiKey: string, recvWindow: string, body: string): string {
  return createHmac('sha256', secret).update(timestamp + apiKey + recvWindow + body).digest('hex');
}

export class BybitSpotClient implements ExchangeClient {
  private readonly baseUrl: string;
  private readonly recvWindow = '5000';

  constructor(private readonly apiKey: string, private readonly apiSecret: string, testnet = true) {
    this.baseUrl = testnet ? 'https://api-testnet.bybit.com' : 'https://api.bybit.com';
  }

  private async request<T>(path: string, payload: Record<string, unknown>): Promise<T> {
    const body = JSON.stringify(payload);
    const timestamp = Date.now().toString();
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-BAPI-API-KEY': this.apiKey,
        'X-BAPI-TIMESTAMP': timestamp,
        'X-BAPI-RECV-WINDOW': this.recvWindow,
        'X-BAPI-SIGN': signature(this.apiSecret, timestamp, this.apiKey, this.recvWindow, body),
      },
      body,
    });
    const data = await response.json() as BybitResponse<T>;
    if (!response.ok || data.retCode !== 0) throw new Error(`Bybit error ${data.retCode}: ${data.retMsg}`);
    return data.result;
  }

  async placeSpotOrder(request: PlaceOrderRequest): Promise<ExchangeOrderResult> {
    const result = await this.request<{ orderId: string; orderLinkId: string }>('/v5/order/create', {
      category: 'spot',
      symbol: request.symbol.toUpperCase(),
      side: request.side,
      orderType: request.orderType,
      qty: request.qty,
      ...(request.price ? { price: request.price } : {}),
      ...(request.takeProfit ? { takeProfit: request.takeProfit, tpOrderType: 'Market' } : {}),
      ...(request.stopLoss ? { stopLoss: request.stopLoss, slOrderType: 'Market' } : {}),
      ...(request.orderLinkId ? { orderLinkId: request.orderLinkId } : {}),
    });
    return { exchange: 'bybit', orderId: result.orderId, orderLinkId: result.orderLinkId, accepted: true, raw: result };
  }

  async cancelSpotOrder(symbol: string, orderId: string): Promise<void> {
    await this.request('/v5/order/cancel', { category: 'spot', symbol: symbol.toUpperCase(), orderId });
  }
}
