'use client';

import { useEffect, useMemo, useState } from 'react';

type Market = { symbol: string; price: number; change24h: number; volume24h: number | null };

type MarketsResponse = { markets?: Market[]; updatedAt?: string; source?: string; error?: string };

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });

export default function MiniTradingTerminal() {
  const [tab, setTab] = useState<'home' | 'trade' | 'auto' | 'portfolio'>('home');
  const [connected, setConnected] = useState(false);
  const [auto, setAuto] = useState(false);
  const [amount, setAmount] = useState('50');
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY');
  const [markets, setMarkets] = useState<Market[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch('/api/markets', { cache: 'no-store' });
        const data = (await response.json()) as MarketsResponse;
        if (!response.ok || !data.markets) throw new Error(data.error ?? 'Market data is unavailable.');
        if (active) {
          setMarkets(data.markets);
          setUpdatedAt(data.updatedAt ?? null);
          setError(null);
        }
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Market data is unavailable.');
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    const interval = window.setInterval(load, 45_000);
    return () => { active = false; window.clearInterval(interval); };
  }, []);

  const selected = useMemo(() => markets.find((market) => market.symbol === 'BTC') ?? markets[0], [markets]);

  const renderMarketValue = (market: Market) => (
    <div style={{ textAlign: 'right' }}>
      <div>{money.format(market.price)}</div>
      <div style={{ color: market.change24h >= 0 ? '#45d483' : '#ff6b7a' }}>{market.change24h >= 0 ? '+' : ''}{market.change24h.toFixed(2)}%</div>
    </div>
  );

  return (
    <main style={{ minHeight: '100vh', background: '#070b14', color: '#f7f9fc', fontFamily: 'system-ui, sans-serif', padding: 16 }}>
      <section style={{ maxWidth: 560, margin: '0 auto' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, gap: 12 }}>
          <div><strong style={{ fontSize: 22 }}>CryptoPulse</strong><div style={{ opacity: .6, fontSize: 12 }}>Trading Terminal</div></div>
          <button onClick={() => setConnected(!connected)} style={buttonStyle}>{connected ? '✓ Connected' : '🔗 Connect Account'}</button>
        </header>

        {tab === 'home' && <>
          {loading && <div style={cardStyle}>Loading live market data…</div>}
          {error && <div style={{ ...cardStyle, borderColor: '#6d2330' }}>Market data unavailable: {error}</div>}
          {selected && <div style={cardStyle}><div style={{ opacity: .65 }}>{selected.symbol}</div><div style={{ fontSize: 32, fontWeight: 800 }}>{money.format(selected.price)}</div><div style={{ color: selected.change24h >= 0 ? '#45d483' : '#ff6b7a' }}>{selected.change24h >= 0 ? '+' : ''}{selected.change24h.toFixed(2)}% · Live CMC quote</div>{updatedAt && <div style={{ opacity: .5, fontSize: 11, marginTop: 6 }}>Updated {new Date(updatedAt).toLocaleTimeString()}</div>}</div>}
          <h3>🔥 Live Scanner</h3>
          {markets.map((m) => <div key={m.symbol} style={{ ...cardStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><div><strong>{m.symbol}</strong><div style={{ opacity: .6, fontSize: 12 }}>24h volume {m.volume24h === null ? '—' : money.format(m.volume24h)}</div></div>{renderMarketValue(m)}</div>)}
          {selected && <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 14 }}><button onClick={() => { setSide('BUY'); setTab('trade'); }} style={{ ...buttonStyle, background: '#145c39' }}>🟢 BUY</button><button onClick={() => { setSide('SELL'); setTab('trade'); }} style={{ ...buttonStyle, background: '#6d2330' }}>🔴 SELL</button></div>}
        </>}

        {tab === 'trade' && <div style={cardStyle}><h2>{side} {selected?.symbol ?? 'BTC'}</h2><label>Quick amount</label><div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, margin: '10px 0 16px' }}>{['10','25','50','100'].map(v => <button key={v} onClick={() => setAmount(v)} style={smallButtonStyle}>${v}</button>)}</div><input value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" style={inputStyle} placeholder="Custom amount" /><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}><input style={inputStyle} placeholder="Stop loss %" defaultValue="2" /><input style={inputStyle} placeholder="Take profit %" defaultValue="5" /></div><button style={{ ...buttonStyle, width: '100%', marginTop: 14 }}>{connected ? `⚡ Confirm ${side} $${amount}` : '🔗 Connect account first'}</button></div>}

        {tab === 'auto' && <div style={cardStyle}><h2>🤖 Auto Trading</h2><p style={{ opacity: .7 }}>Scanner → Strategy → Risk/Order Engine → Exchange</p><div style={{ display: 'flex', justifyContent: 'space-between', margin: '18px 0' }}><span>Momentum + Volume</span><button onClick={() => setAuto(!auto)} style={{ ...buttonStyle, background: auto ? '#145c39' : '#242b39' }}>{auto ? 'ON' : 'OFF'}</button></div><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}><input style={inputStyle} defaultValue="2" placeholder="SL %" /><input style={inputStyle} defaultValue="5" placeholder="TP %" /></div><button style={{ ...buttonStyle, width: '100%', marginTop: 14 }}>{auto ? '🤖 Automation enabled' : 'Enable automation'}</button></div>}

        {tab === 'portfolio' && <div style={cardStyle}><h2>💼 Portfolio</h2><div style={{ fontSize: 30, fontWeight: 800 }}>{connected ? '$—' : 'Connect account'}</div><p style={{ opacity: .6 }}>Balances, positions, open orders and trade history appear here after the user connects an exchange account.</p></div>}

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
