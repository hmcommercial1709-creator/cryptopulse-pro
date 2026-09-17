'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

type Market = { symbol: string; price: number; change24h: number; volume24h: number | null };
type MarketsResponse = { source: string; updatedAt: string; markets: Market[]; error?: string };

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 });

export default function MiniTradingTerminal() {
  const [tab, setTab] = useState<'home' | 'trade' | 'auto' | 'portfolio'>('home');
  const [markets, setMarkets] = useState<Market[]>([]);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState('');
  const [selectedSymbol, setSelectedSymbol] = useState('BTC');
  const [amount, setAmount] = useState('50');
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY');

  const loadMarkets = useCallback(async () => {
    try {
      const response = await fetch('/api/markets', { cache: 'no-store' });
      const body = (await response.json()) as MarketsResponse;
      if (!response.ok || !body.markets?.length) throw new Error(body.error ?? 'Market data is temporarily unavailable.');
      setMarkets(body.markets);
      setUpdatedAt(body.updatedAt);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load market data.');
    }
  }, []);

  useEffect(() => {
    void loadMarkets();
    const timer = window.setInterval(() => void loadMarkets(), 45_000);
    return () => window.clearInterval(timer);
  }, [loadMarkets]);

  const selected = useMemo(() => markets.find((m) => m.symbol === selectedSymbol) ?? markets[0], [markets, selectedSymbol]);

  return (
    <main style={{ minHeight: '100vh', background: '#070b14', color: '#f7f9fc', fontFamily: 'system-ui, sans-serif', padding: 16 }}>
      <section style={{ maxWidth: 560, margin: '0 auto' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 18 }}>
          <div><strong style={{ fontSize: 22 }}>CryptoPulse</strong><div style={{ opacity: .6, fontSize: 12 }}>Telegram Market Intelligence</div></div>
          <button onClick={() => void loadMarkets()} style={buttonStyle}>↻ Refresh</button>
        </header>

        {error && <div style={{ ...cardStyle, borderColor: '#6d2330' }}><strong>Market data unavailable</strong><p style={{ opacity: .75 }}>{error}</p><button onClick={() => void loadMarkets()} style={buttonStyle}>Retry</button></div>}

        {tab === 'home' && <>
          {selected && <div style={cardStyle}><div style={{ opacity: .65 }}>{selected.symbol} · CoinMarketCap</div><div style={{ fontSize: 32, fontWeight: 800 }}>{money.format(selected.price)}</div><div style={{ color: selected.change24h >= 0 ? '#45d483' : '#ff6678' }}>{selected.change24h >= 0 ? '+' : ''}{selected.change24h.toFixed(2)}% · 24h</div><div style={{ opacity: .55, fontSize: 11, marginTop: 8 }}>Updated {updatedAt ? new Date(updatedAt).toLocaleTimeString() : '—'}</div></div>}
          <h3>Live Market Scanner</h3>
          {markets.map((m) => <button key={m.symbol} onClick={() => { setSelectedSymbol(m.symbol); setTab('trade'); }} style={{ ...cardStyle, width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', textAlign: 'left', color: 'inherit', cursor: 'pointer' }}><div><strong>{m.symbol}</strong><div style={{ opacity: .6, fontSize: 12 }}>24h volume {m.volume24h == null ? '—' : `$${compact.format(m.volume24h)}`}</div></div><div style={{ textAlign: 'right' }}><div>{money.format(m.price)}</div><div style={{ color: m.change24h >= 0 ? '#45d483' : '#ff6678' }}>{m.change24h >= 0 ? '+' : ''}{m.change24h.toFixed(2)}%</div></div></button>)}
        </>}

        {tab === 'trade' && <div style={cardStyle}><h2>{side} {selected?.symbol ?? selectedSymbol}</h2><p style={{ opacity: .65 }}>Market intelligence view. Exchange execution is not enabled in this Mini App yet.</p><label>Amount (USD)</label><div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, margin: '10px 0 16px' }}>{['10','25','50','100'].map(v => <button key={v} onClick={() => setAmount(v)} style={smallButtonStyle}>${v}</button>)}</div><input value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" style={inputStyle} /><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}><button onClick={() => setSide('BUY')} style={{ ...buttonStyle, background: side === 'BUY' ? '#145c39' : '#242b39' }}>BUY</button><button onClick={() => setSide('SELL')} style={{ ...buttonStyle, background: side === 'SELL' ? '#6d2330' : '#242b39' }}>SELL</button></div></div>}

        {tab === 'auto' && <div style={cardStyle}><h2>🤖 Automation</h2><p style={{ opacity: .7 }}>Strategy monitoring and order execution will be enabled only after the exchange connection, position sizing, balance checks, price guards and audit trail are fully wired.</p><div style={{ padding: 12, borderRadius: 12, background: '#0b111d', opacity: .8 }}>Status: <strong>Not enabled</strong></div></div>}

        {tab === 'portfolio' && <div style={cardStyle}><h2>💼 Portfolio</h2><p style={{ opacity: .65 }}>No exchange account is connected to this Mini App. Portfolio balances and positions will appear here after secure server-side account integration is implemented.</p></div>}

        <nav style={{ position: 'sticky', bottom: 0, marginTop: 20, display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6, background: '#0d1320', padding: 8, borderRadius: 16 }}>
          {([['home','⌂ Home'],['trade','⚡ Trade'],['auto','🤖 Auto'],['portfolio','💼 Portfolio']] as const).map(([id,label]) => <button key={id} onClick={() => setTab(id)} style={{ ...smallButtonStyle, opacity: tab === id ? 1 : .55 }}>{label}</button>)}
        </nav>
      </section>
    </main>
  );
}

const cardStyle: React.CSSProperties = { background: '#101827', border: '1px solid #1e2a3c', borderRadius: 18, padding: 16, marginBottom: 10 };
const buttonStyle: React.CSSProperties = { border: 0, borderRadius: 12, padding: '11px 14px', background: '#1769e0', color: 'white', fontWeight: 700, cursor: 'pointer' };
const smallButtonStyle: React.CSSProperties = { border: 0, borderRadius: 10, padding: 10, background: '#1a2332', color: 'white', cursor: 'pointer' };
const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid #2a3547', borderRadius: 10, padding: 12, background: '#0b111d', color: 'white' };
