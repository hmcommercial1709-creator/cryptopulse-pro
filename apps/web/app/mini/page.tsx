'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

type Market = { symbol: string; price: number; change24h: number; volume24h: number | null };
type MarketsResponse = { source: string; updatedAt: string; markets: Market[]; error?: string };
type WatchItem = { id: string; symbol: string; created_at: string };
type AlertItem = { id: string; symbol: string; condition: 'above' | 'below' | 'change24h'; threshold: number; active: boolean; created_at: string };
type Tab = 'home' | 'trade' | 'intelligence' | 'watchlist' | 'alerts' | 'auto' | 'portfolio' | 'referral' | 'pro';
type HashSection = 'markets' | 'signals' | 'referral' | 'pro';

declare global {
  interface Window { Telegram?: { WebApp?: { initData?: string; openTelegramLink?: (url: string) => void } } }
}

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 });
const ACTIVATION_EVENTS = new Set(['market_view', 'watchlist_add', 'alert_create', 'share_open', 'share_click', 'first_share', 'agent_intent']);

export default function MiniTradingTerminal() {
  const [tab, setTab] = useState<Tab>('home');
  const [markets, setMarkets] = useState<Market[]>([]);
  const [watchlist, setWatchlist] = useState<WatchItem[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [updatedAt, setUpdatedAt] = useState('');
  const [selectedSymbol, setSelectedSymbol] = useState('BTC');
  const [amount, setAmount] = useState('50');
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY');
  const [alertSymbol, setAlertSymbol] = useState('BTC');
  const [alertCondition, setAlertCondition] = useState<'above' | 'below' | 'change24h'>('above');
  const [alertThreshold, setAlertThreshold] = useState('');
  const [shareMessage, setShareMessage] = useState('');

  const applyHashRoute = useCallback((hash: string) => {
    const section = hash.replace(/^#/, '').toLowerCase() as HashSection;
    if (section === 'markets') setTab('home');
    else if (section === 'signals') setTab('intelligence');
    else if (section === 'referral') setTab('referral');
    else if (section === 'pro') setTab('pro');
  }, []);

  const goToSection = useCallback((section: HashSection) => {
    window.history.replaceState(null, '', `#${section}`);
    applyHashRoute(`#${section}`);
  }, [applyHashRoute]);

  const authHeaders = useCallback((): HeadersInit => ({
    'Content-Type': 'application/json',
    'x-telegram-init-data': window.Telegram?.WebApp?.initData ?? '',
  }), []);

  const track = useCallback(async (event: string, metadata: Record<string, unknown> = {}) => {
    try {
      await fetch('/api/growth', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ event, metadata }) });
      if (ACTIVATION_EVENTS.has(event)) {
        const key = 'cryptopulse:activation:v1';
        if (!window.sessionStorage.getItem(key)) {
          window.sessionStorage.setItem(key, '1');
          await fetch('/api/growth', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ event: 'activation', metadata: { trigger: event, ...metadata } }) });
        }
      }
    } catch { /* analytics must never block the product */ }
  }, [authHeaders]);

  const loadMarkets = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/markets', { cache: 'no-store' });
      const body = (await response.json()) as MarketsResponse;
      if (!response.ok || !body.markets?.length) throw new Error(body.error ?? 'Market data is temporarily unavailable.');
      setMarkets(body.markets); setUpdatedAt(body.updatedAt); setError('');
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to load market data.'); }
    finally { setLoading(false); }
  }, []);

  const loadUserData = useCallback(async () => {
    if (!window.Telegram?.WebApp?.initData) return;
    try {
      const headers = authHeaders();
      const [watchResponse, alertResponse] = await Promise.all([
        fetch('/api/watchlist', { headers, cache: 'no-store' }), fetch('/api/alerts', { headers, cache: 'no-store' }),
      ]);
      if (watchResponse.ok) setWatchlist(((await watchResponse.json()) as { items: WatchItem[] }).items ?? []);
      if (alertResponse.ok) setAlerts(((await alertResponse.json()) as { alerts: AlertItem[] }).alerts ?? []);
    } catch { /* keep market terminal usable */ }
  }, [authHeaders]);

  useEffect(() => {
    void loadMarkets(); void loadUserData(); void track('mini_open');
    applyHashRoute(window.location.hash);
    const onHashChange = () => applyHashRoute(window.location.hash);
    window.addEventListener('hashchange', onHashChange);
    try {
      const startParam = (new URLSearchParams(window.location.search).get('tgWebAppStartParam') ?? '').trim().slice(0, 64);
      const initData = window.Telegram?.WebApp?.initData ?? '';
      if (startParam.startsWith('ref_')) setTab('referral');
      if (startParam && initData) {
        const key = `cryptopulse:startapp:${startParam}`;
        if (!window.sessionStorage.getItem(key)) {
          window.sessionStorage.setItem(key, '1');
          void fetch('/api/growth', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-telegram-init-data': initData }, body: JSON.stringify({ event: 'startapp_open', metadata: { startParam } }) }).catch(() => undefined);
        }
      }
    } catch { /* attribution must never affect Mini App availability */ }
    const timer = window.setInterval(() => void loadMarkets(), 45_000);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('hashchange', onHashChange);
    };
  }, [applyHashRoute, loadMarkets, loadUserData, track]);

  const selected = useMemo(() => markets.find((m) => m.symbol === selectedSymbol) ?? markets[0], [markets, selectedSymbol]);
  const freshness = updatedAt ? Math.max(0, Math.round((Date.now() - new Date(updatedAt).getTime()) / 1000)) : null;
  const isWatched = selected ? watchlist.some((item) => item.symbol === selected.symbol) : false;

  const toggleWatch = async (symbol: string) => {
    setBusy(true);
    try {
      const watched = watchlist.some((item) => item.symbol === symbol);
      const response = await fetch(watched ? `/api/watchlist?symbol=${encodeURIComponent(symbol)}` : '/api/watchlist', { method: watched ? 'DELETE' : 'POST', headers: authHeaders(), body: watched ? undefined : JSON.stringify({ symbol }) });
      if (!response.ok) throw new Error(((await response.json()) as { error?: string }).error ?? 'Watchlist update failed.');
      await loadUserData(); void track(watched ? 'watchlist_remove' : 'watchlist_add', { symbol });
    } catch (err) { setError(err instanceof Error ? err.message : 'Watchlist update failed.'); }
    finally { setBusy(false); }
  };

  const createAlert = async () => {
    const threshold = Number(alertThreshold); if (!Number.isFinite(threshold)) { setError('Enter a valid alert threshold.'); return; }
    setBusy(true);
    try {
      const response = await fetch('/api/alerts', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ symbol: alertSymbol, condition: alertCondition, threshold }) });
      if (!response.ok) throw new Error(((await response.json()) as { error?: string }).error ?? 'Alert creation failed.');
      setAlertThreshold(''); await loadUserData(); void track('alert_create', { symbol: alertSymbol, condition: alertCondition });
    } catch (err) { setError(err instanceof Error ? err.message : 'Alert creation failed.'); }
    finally { setBusy(false); }
  };

  const removeAlert = async (id: string) => {
    setBusy(true); try { const response = await fetch(`/api/alerts?id=${encodeURIComponent(id)}`, { method: 'DELETE', headers: authHeaders() }); if (!response.ok) throw new Error('Alert removal failed.'); await loadUserData(); void track('alert_remove', { id }); } catch (err) { setError(err instanceof Error ? err.message : 'Alert removal failed.'); } finally { setBusy(false); }
  };

  const shareSelected = async () => {
    if (!selected) return; setBusy(true);
    try {
      const text = `⚡ CryptoPulse · ${selected.symbol}\nPrice ${money.format(selected.price)}\n24h ${selected.change24h >= 0 ? '+' : ''}${selected.change24h.toFixed(2)}%`;
      const response = await fetch('/api/share', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ symbol: selected.symbol, cardType: 'market', payload: { text, price: selected.price, change24h: selected.change24h } }) });
      if (!response.ok) throw new Error(((await response.json()) as { error?: string }).error ?? 'Share link failed.');
      const body = (await response.json()) as { shareUrl: string };
      if (window.Telegram?.WebApp?.openTelegramLink) window.Telegram.WebApp.openTelegramLink(body.shareUrl); else window.open(body.shareUrl, '_blank', 'noopener,noreferrer');
      setShareMessage('Share card ready.'); void track('first_share', { symbol: selected.symbol, cardType: 'market' });
    } catch (err) { setError(err instanceof Error ? err.message : 'Share link failed.'); }
    finally { setBusy(false); }
  };

  return (
    <main style={{ minHeight: '100vh', background: '#070b14', color: '#f7f9fc', fontFamily: 'system-ui, sans-serif', padding: 16 }}>
      <section style={{ maxWidth: 620, margin: '0 auto' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 18 }}><div><strong style={{ fontSize: 22 }}>CryptoPulse</strong><div style={{ opacity: .6, fontSize: 12 }}>Telegram Market Intelligence</div></div><button onClick={() => void loadMarkets()} style={buttonStyle} disabled={loading}>{loading ? 'Loading…' : '↻ Refresh'}</button></header>
        <section aria-label="CryptoPulse sections" style={quickNavStyle}>
          <button onClick={() => goToSection('markets')} style={{ ...quickNavButtonStyle, background: '#1769e0' }}>📈 Markets</button>
          <button onClick={() => goToSection('signals')} style={{ ...quickNavButtonStyle, background: '#7c3aed' }}>⚡ Signals</button>
          <button onClick={() => goToSection('referral')} style={{ ...quickNavButtonStyle, background: '#0f9f6e' }}>💰 Referral</button>
          <button onClick={() => goToSection('pro')} style={{ ...quickNavButtonStyle, background: '#d97706' }}>⭐ Pro</button>
        </section>
        {error && <div style={{ ...cardStyle, borderColor: '#6d2330' }}><strong>Action unavailable</strong><p style={{ opacity: .75 }}>{error}</p><button onClick={() => setError('')} style={smallButtonStyle}>Dismiss</button></div>}
        {shareMessage && <div style={{ ...cardStyle, borderColor: '#245f45' }}>{shareMessage}</div>}
        {tab === 'home' && <>{selected && <div style={cardStyle}><div style={{ opacity: .65 }}>{selected.symbol} · CoinMarketCap</div><div style={{ fontSize: 32, fontWeight: 800 }}>{money.format(selected.price)}</div><div style={{ color: selected.change24h >= 0 ? '#45d483' : '#ff6678' }}>{selected.change24h >= 0 ? '+' : ''}{selected.change24h.toFixed(2)}% · 24h</div><div style={{ opacity: .55, fontSize: 11, marginTop: 8 }}>Updated {updatedAt ? new Date(updatedAt).toLocaleTimeString() : '—'}{freshness !== null ? ` · ${freshness}s ago` : ''}</div><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}><button onClick={() => void toggleWatch(selected.symbol)} style={smallButtonStyle} disabled={busy}>{isWatched ? '★ In Watchlist' : '☆ Add Watchlist'}</button><button onClick={() => void shareSelected()} style={smallButtonStyle} disabled={busy}>📤 Share Snapshot</button></div></div>}<h3>Live Market Scanner</h3>{loading && !markets.length && <div style={cardStyle}>Loading live market data…</div>}{markets.map((m) => <button key={m.symbol} onClick={() => { setSelectedSymbol(m.symbol); setTab('trade'); void track('market_view', { symbol: m.symbol }); }} style={{ ...cardStyle, width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', textAlign: 'left', color: 'inherit', cursor: 'pointer' }}><div><strong>{m.symbol}</strong><div style={{ opacity: .6, fontSize: 12 }}>24h volume {m.volume24h == null ? '—' : `$${compact.format(m.volume24h)}`}</div></div><div style={{ textAlign: 'right' }}><div>{money.format(m.price)}</div><div style={{ color: m.change24h >= 0 ? '#45d483' : '#ff6678' }}>{m.change24h >= 0 ? '+' : ''}{m.change24h.toFixed(2)}%</div></div></button>)}</>}
        {tab === 'trade' && <div style={cardStyle}><h2>{side} {selected?.symbol ?? selectedSymbol}</h2><p style={{ opacity: .65 }}>Market intelligence view. Exchange execution is not enabled in this Mini App.</p>{selected && <div style={{ marginBottom: 14, padding: 12, borderRadius: 12, background: '#0b111d' }}><div style={{ fontSize: 24, fontWeight: 800 }}>{money.format(selected.price)}</div><div style={{ opacity: .7 }}>{selected.change24h >= 0 ? 'Positive' : selected.change24h < 0 ? 'Negative' : 'Flat'} 24h movement</div></div>}<label>Amount (USD)</label><div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, margin: '10px 0 16px' }}>{['10','25','50','100'].map(v => <button key={v} onClick={() => setAmount(v)} style={smallButtonStyle}>${v}</button>)}</div><input value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" style={inputStyle} /><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}><button onClick={() => setSide('BUY')} style={{ ...buttonStyle, background: side === 'BUY' ? '#145c39' : '#242b39' }}>BUY</button><button onClick={() => setSide('SELL')} style={{ ...buttonStyle, background: side === 'SELL' ? '#6d2330' : '#242b39' }}>SELL</button></div><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}><button onClick={() => void toggleWatch(selected?.symbol ?? selectedSymbol)} style={smallButtonStyle}>{isWatched ? '★ Watchlist' : '☆ Watchlist'}</button><button onClick={() => void shareSelected()} style={smallButtonStyle}>📤 Share</button></div></div>}
        {tab === 'intelligence' && <div style={cardStyle}><h2>📊 Asset Intelligence</h2><p style={{ opacity: .65 }}>Factual market snapshots from the latest CoinMarketCap quote response.</p>{markets.map((m) => <div key={m.symbol} style={{ padding: '12px 0', borderBottom: '1px solid #1e2a3c' }}><div style={{ display: 'flex', justifyContent: 'space-between' }}><strong>{m.symbol}</strong><span>{money.format(m.price)}</span></div><div style={{ display: 'flex', justifyContent: 'space-between', opacity: .7, fontSize: 12, marginTop: 4 }}><span>{m.change24h >= 0 ? 'Positive' : m.change24h < 0 ? 'Negative' : 'Flat'} 24h movement</span><span>{m.change24h >= 0 ? '+' : ''}{m.change24h.toFixed(2)}%</span></div><div style={{ opacity: .55, fontSize: 11, marginTop: 3 }}>24h volume {m.volume24h == null ? '—' : `$${compact.format(m.volume24h)}`}</div></div>)}</div>}
        {tab === 'watchlist' && <div style={cardStyle}><h2>⭐ Watchlist</h2><p style={{ opacity: .65 }}>Your Telegram-scoped assets are stored server-side.</p>{watchlist.length ? watchlist.map((item) => { const market = markets.find(m => m.symbol === item.symbol); return <button key={item.id} onClick={() => { setSelectedSymbol(item.symbol); setTab('trade'); }} style={{ ...cardStyle, width: '100%', display: 'flex', justifyContent: 'space-between', color: 'inherit', textAlign: 'left' }}><span><strong>{item.symbol}</strong>{market && <span style={{ opacity: .65, marginLeft: 8 }}>{money.format(market.price)}</span>}</span><span>{market ? `${market.change24h >= 0 ? '+' : ''}${market.change24h.toFixed(2)}%` : '—'}</span></button> }) : <div style={{ opacity: .6 }}>No assets saved yet. Add one from a market card.</div>}</div>}
        {tab === 'alerts' && <div style={cardStyle}><h2>🔔 Price Alerts</h2><div style={{ display: 'grid', gap: 8 }}><select value={alertSymbol} onChange={e => setAlertSymbol(e.target.value)} style={inputStyle}>{markets.map(m => <option key={m.symbol}>{m.symbol}</option>)}</select><select value={alertCondition} onChange={e => setAlertCondition(e.target.value as typeof alertCondition)} style={inputStyle}><option value="above">Price above</option><option value="below">Price below</option><option value="change24h">24h change reaches</option></select><input value={alertThreshold} onChange={e => setAlertThreshold(e.target.value)} inputMode="decimal" placeholder={alertCondition === 'change24h' ? 'e.g. 5 or -5' : 'Target price'} style={inputStyle} /><button onClick={() => void createAlert()} style={buttonStyle} disabled={busy}>Create Alert</button></div><div style={{ marginTop: 18 }}>{alerts.map(a => <div key={a.id} style={{ ...cardStyle, display: 'flex', justifyContent: 'space-between', gap: 8 }}><div><strong>{a.symbol}</strong><div style={{ opacity: .65 }}>{a.condition === 'above' ? 'Above' : a.condition === 'below' ? 'Below' : '24h change'} · {a.threshold}</div></div><button onClick={() => void removeAlert(a.id)} style={smallButtonStyle} disabled={busy}>Remove</button></div>)}</div></div>}
        {tab === 'auto' && <div style={cardStyle}><h2>🤖 Automation</h2><p style={{ opacity: .7 }}>Strategy monitoring and order execution remain disabled until exchange connection, position sizing, balance checks, price guards and audit trails are fully wired.</p><div style={{ padding: 12, borderRadius: 12, background: '#0b111d', opacity: .8 }}>Status: <strong>Not enabled</strong></div></div>}
        {tab === 'portfolio' && <div style={cardStyle}><h2>💼 Portfolio</h2><p style={{ opacity: .65 }}>No exchange account is connected to this Mini App. Portfolio balances and positions will appear here after secure server-side account integration is implemented.</p></div>}
        {tab === 'referral' && <div style={cardStyle}><h2>👥 Referral Center</h2><p style={{ opacity: .7 }}>Invite new users through Telegram and track real server-side referral activity.</p><button onClick={() => { window.location.href = '/mini/referral'; void track('referral_open'); }} style={buttonStyle}>Open Referral Center</button><div style={{ marginTop: 12, padding: 12, borderRadius: 12, background: '#0b111d', opacity: .65, fontSize: 12 }}>Referral attribution uses Telegram <code>startapp=ref_…</code> links and is recorded when the invited user opens the Mini App.</div></div>}
        {tab === 'pro' && <div id="pro" style={cardStyle}><h2>⭐ CryptoPulse Pro</h2><p style={{ opacity: .7 }}>Unlock premium CryptoPulse features through Telegram Stars. Review the available Pro membership options in the secure Pro area.</p><button onClick={() => { window.location.href = '/mini/pro'; void track('pro_open'); }} style={{ ...buttonStyle, background: '#d97706' }}>⭐ Open Pro Membership</button><div style={{ marginTop: 12, padding: 12, borderRadius: 12, background: '#0b111d', opacity: .65, fontSize: 12 }}>Pro membership is handled server-side and payments are processed through Telegram Stars.</div></div>}
        <nav style={{ position: 'sticky', bottom: 0, marginTop: 20, display: 'grid', gridTemplateColumns: 'repeat(8,1fr)', gap: 5, background: '#0d1320', padding: 8, borderRadius: 16, overflowX: 'auto' }}>{([['home','⌂'],['trade','⚡'],['intelligence','📊'],['watchlist','⭐'],['alerts','🔔'],['auto','🤖'],['portfolio','💼'],['referral','👥']] as const).map(([id,label]) => <button key={id} onClick={() => setTab(id)} style={{ ...smallButtonStyle, opacity: tab === id ? 1 : .55, minWidth: 48 }}>{label}</button>)}</nav>
      </section>
    </main>
  );
}

const quickNavStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8, marginBottom: 14 };
const quickNavButtonStyle: React.CSSProperties = { border: 0, borderRadius: 12, padding: '12px 8px', color: 'white', fontWeight: 800, cursor: 'pointer', boxShadow: '0 6px 18px rgba(0,0,0,.18)' };
const cardStyle: React.CSSProperties = { background: '#101827', border: '1px solid #1e2a3c', borderRadius: 18, padding: 16, marginBottom: 10 };
const buttonStyle: React.CSSProperties = { border: 0, borderRadius: 12, padding: '11px 14px', background: '#1769e0', color: 'white', fontWeight: 700, cursor: 'pointer' };
const smallButtonStyle: React.CSSProperties = { border: 0, borderRadius: 10, padding: 10, background: '#1a2332', color: 'white', cursor: 'pointer' };
const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid #2a3547', borderRadius: 10, padding: 12, background: '#0b111d', color: 'white' };