'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

type Market = { symbol: string; price: number; change24h: number; volume24h: number | null };
type MarketsResponse = { source: string; updatedAt: string; markets: Market[]; error?: string };
type WatchItem = { id: string; symbol: string; created_at: string };
type AlertItem = { id: string; symbol: string; condition: 'above' | 'below' | 'change24h'; threshold: number; active: boolean; created_at: string };
type Tab = 'home' | 'trade' | 'intelligence' | 'watchlist' | 'alerts' | 'auto' | 'portfolio' | 'referral' | 'pro';
type HashSection = 'markets' | 'signals' | 'referral' | 'pro';
type Plan = { code: string; name: string; description: string; price_stars: number; billing_period: 'monthly' | 'annual'; recurring: boolean; features: string[] };


type TelegramRuntime = { WebApp?: { initData?: string; openTelegramLink?: (url: string) => void; sendData?: (data: string) => void; ready?: () => void; expand?: () => void } };
const getTelegramWebApp = (): TelegramRuntime['WebApp'] => (window as unknown as { Telegram?: TelegramRuntime }).Telegram?.WebApp;

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 });
const ACTIVATION_EVENTS = new Set(['market_view', 'watchlist_add', 'alert_create', 'share_open', 'share_click', 'first_share', 'agent_intent']);

export default function MiniTradingTerminal() {
  const [tab, setTab] = useState<Tab>('home');
  const [markets, setMarkets] = useState<Market[]>([]);
  const [watchlist, setWatchlist] = useState<WatchItem[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [error, setError] = useState('');
  const [marketError, setMarketError] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [updatedAt, setUpdatedAt] = useState('');
  const [selectedSymbol, setSelectedSymbol] = useState('BTC');
  const [amount, setAmount] = useState('50');
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY');
  const [alertSymbol, setAlertSymbol] = useState('BTC');
  const [alertCondition, setAlertCondition] = useState<'above' | 'below' | 'change24h'>('above');
  const [alertThreshold, setAlertThreshold] = useState('');
  const [shareMessage, setShareMessage] = useState('');
  const [plans, setPlans] = useState<Plan[]>([]);
  const [agentInstruction, setAgentInstruction] = useState('');
  const [agentTaskMessage, setAgentTaskMessage] = useState('');

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
    'x-telegram-init-data': getTelegramWebApp()?.initData ?? '',
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
    // Market I/O is intentionally isolated to the Markets view. Other tabs never
    // depend on this request and must remain interactive during provider outages.
    try {
      setLoading(true);
      setMarketError('');
      const response = await fetch('/api/markets', { cache: 'no-store' });
      const body = (await response.json()) as MarketsResponse;
      if (!response.ok || !body.markets?.length) {
        setMarketError(body.error ?? 'Live market data is temporarily unavailable.');
        return;
      }
      setMarkets(body.markets);
      setUpdatedAt(body.updatedAt);
    } catch {
      setMarketError('Live market data is temporarily unavailable.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadPlans = useCallback(async () => {
    try {
      const response = await fetch('/api/plans', { cache: 'no-store' });
      if (response.ok) setPlans(((await response.json()) as { plans: Plan[] }).plans ?? []);
    } catch { /* pricing UI remains usable with fallback */ }
  }, []);

  const createAgentTask = async () => {
    if (!agentInstruction.trim()) return;
    setBusy(true);
    try {
      const response = await fetch('/api/agent/tasks', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ instruction: agentInstruction.trim(), requiresConfirmation: true }),
      });
      const body = await response.json() as { message?: string; plan?: string; trial?: boolean; expiresAt?: string };
      if (!response.ok) throw new Error(body.message ?? 'Could not create the task.');
      setAgentTaskMessage(body.trial ? `✅ Your free AI task is active for 24 hours. After that it stops and CryptoPulse will show you the upgrade options.` : `✅ ${body.plan === 'vip' ? 'VIP' : 'Pro'} AI task created. CryptoPulse will keep monitoring it according to your task settings.`);
      setAgentInstruction('');
      void track('agent_intent', { instructionLength: agentInstruction.length });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the task.');
    } finally {
      setBusy(false);
    }
  };

  const loadUserData = useCallback(async () => {
    if (!getTelegramWebApp()?.initData) return;
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
    try { getTelegramWebApp()?.ready?.(); getTelegramWebApp()?.expand?.(); } catch { /* Telegram runtime is optional outside Telegram */ }
    void loadUserData(); void loadPlans(); void track('mini_open');
    applyHashRoute(window.location.hash);
    const onHashChange = () => applyHashRoute(window.location.hash);
    window.addEventListener('hashchange', onHashChange);
    try {
      const startParam = (new URLSearchParams(window.location.search).get('tgWebAppStartParam') ?? '').trim().slice(0, 64);
      const initData = getTelegramWebApp()?.initData ?? '';
      if (startParam.startsWith('ref_')) setTab('referral');
      if (startParam && initData) {
        const key = `cryptopulse:startapp:${startParam}`;
        if (!window.sessionStorage.getItem(key)) {
          window.sessionStorage.setItem(key, '1');
          void fetch('/api/growth', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-telegram-init-data': initData }, body: JSON.stringify({ event: 'startapp_open', metadata: { startParam } }) }).catch(() => undefined);
        }
      }
    } catch { /* attribution must never affect Mini App availability */ }
    return () => {
      window.removeEventListener('hashchange', onHashChange);
    };
  }, [applyHashRoute, loadUserData, track]);

  useEffect(() => {
    // Only the Markets view fetches market prices. Referral, Pro, Signals and
    // all other tabs are completely independent from market-provider state.
    if (tab !== 'home') return;
    void loadMarkets();
    const timer = window.setInterval(() => void loadMarkets(), 45_000);
    return () => window.clearInterval(timer);
  }, [tab, loadMarkets]);

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
      if (getTelegramWebApp()?.openTelegramLink) getTelegramWebApp()?.openTelegramLink?.(body.shareUrl); else window.open(body.shareUrl, '_blank', 'noopener,noreferrer');
      setShareMessage('Share card ready.'); void track('first_share', { symbol: selected.symbol, cardType: 'market' });
    } catch (err) { setError(err instanceof Error ? err.message : 'Share link failed.'); }
    finally { setBusy(false); }
  };

  return (
    <main style={{ minHeight: '100vh', background: '#070b14', color: '#f7f9fc', fontFamily: 'system-ui, sans-serif', padding: 16 }}>
      <section style={{ maxWidth: 620, margin: '0 auto' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 18 }}><div><strong style={{ fontSize: 22 }}>CryptoPulse</strong><div style={{ opacity: .6, fontSize: 12 }}>Telegram Market Intelligence</div></div>{tab === 'home' && <button onClick={() => void loadMarkets()} style={buttonStyle} disabled={loading}>{loading ? 'Loading…' : '↻ Refresh'}</button>}</header>
        <section aria-label="CryptoPulse sections" style={quickNavStyle}>
          <button onClick={() => goToSection('markets')} style={{ ...quickNavButtonStyle, background: '#1769e0' }}>📈 Markets</button>
          <button onClick={() => goToSection('signals')} style={{ ...quickNavButtonStyle, background: '#7c3aed' }}>⚡ Signals</button>
          <button onClick={() => goToSection('referral')} style={{ ...quickNavButtonStyle, background: '#0f9f6e' }}>💰 Referral</button>
          <button onClick={() => goToSection('pro')} style={{ ...quickNavButtonStyle, background: '#d97706' }}>⭐ Pro</button>
        </section>
        {shareMessage && <div style={{ ...cardStyle, borderColor: '#245f45' }}>{shareMessage}</div>}
        {tab === 'home' && <>{selected && <div style={cardStyle}><div style={{ opacity: .65 }}>{selected.symbol} · CoinMarketCap</div><div style={{ fontSize: 32, fontWeight: 800 }}>{money.format(selected.price)}</div><div style={{ color: selected.change24h >= 0 ? '#45d483' : '#ff6678' }}>{selected.change24h >= 0 ? '+' : ''}{selected.change24h.toFixed(2)}% · 24h</div><div style={{ opacity: .55, fontSize: 11, marginTop: 8 }}>Updated {updatedAt ? new Date(updatedAt).toLocaleTimeString() : '—'}{freshness !== null ? ` · ${freshness}s ago` : ''}</div><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}><button onClick={() => void toggleWatch(selected.symbol)} style={smallButtonStyle} disabled={busy}>{isWatched ? '★ In Watchlist' : '☆ Add Watchlist'}</button><button onClick={() => void shareSelected()} style={smallButtonStyle} disabled={busy}>📤 Share Snapshot</button></div></div>}<h3>Live Market Scanner</h3>{loading && !markets.length && <div style={cardStyle}>Loading live market data…</div>}{marketError && <div style={{ ...cardStyle, borderColor: '#6d2330', background: '#0b111d' }}><strong style={{ fontSize: 13 }}>Market data unavailable</strong><div style={{ opacity: .65, fontSize: 12, marginTop: 4 }}>The rest of CryptoPulse remains fully available. You can retry from this Markets view.</div><button onClick={() => void loadMarkets()} style={{ ...smallButtonStyle, marginTop: 10 }} disabled={loading}>{loading ? 'Retrying…' : 'Retry market data'}</button></div>}{markets.map((m) => <button key={m.symbol} onClick={() => { setSelectedSymbol(m.symbol); setTab('trade'); void track('market_view', { symbol: m.symbol }); }} style={{ ...cardStyle, width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', textAlign: 'left', color: 'inherit', cursor: 'pointer' }}><div><strong>{m.symbol}</strong><div style={{ opacity: .6, fontSize: 12 }}>24h volume {m.volume24h == null ? '—' : `$${compact.format(m.volume24h)}`}</div></div><div style={{ textAlign: 'right' }}><div>{money.format(m.price)}</div><div style={{ color: m.change24h >= 0 ? '#45d483' : '#ff6678' }}>{m.change24h >= 0 ? '+' : ''}{m.change24h.toFixed(2)}%</div></div></button>)}</>}
        {tab === 'trade' && <div style={cardStyle}><h2>{side} {selected?.symbol ?? selectedSymbol}</h2><p style={{ opacity: .65 }}>Market intelligence view. Exchange execution is not enabled in this Mini App.</p>{selected && <div style={{ marginBottom: 14, padding: 12, borderRadius: 12, background: '#0b111d' }}><div style={{ fontSize: 24, fontWeight: 800 }}>{money.format(selected.price)}</div><div style={{ opacity: .7 }}>{selected.change24h >= 0 ? 'Positive' : selected.change24h < 0 ? 'Negative' : 'Flat'} 24h movement</div></div>}<label>Amount (USD)</label><div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, margin: '10px 0 16px' }}>{['10','25','50','100'].map(v => <button key={v} onClick={() => setAmount(v)} style={smallButtonStyle}>${v}</button>)}</div><input value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" style={inputStyle} /><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}><button onClick={() => setSide('BUY')} style={{ ...buttonStyle, background: side === 'BUY' ? '#145c39' : '#242b39' }}>BUY</button><button onClick={() => setSide('SELL')} style={{ ...buttonStyle, background: side === 'SELL' ? '#6d2330' : '#242b39' }}>SELL</button></div><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}><button onClick={() => void toggleWatch(selected?.symbol ?? selectedSymbol)} style={smallButtonStyle}>{isWatched ? '★ Watchlist' : '☆ Watchlist'}</button><button onClick={() => void shareSelected()} style={smallButtonStyle}>📤 Share</button></div></div>}
        {tab === 'intelligence' && <div style={cardStyle}><h2>📊 Asset Intelligence</h2><p style={{ opacity: .65 }}>Factual market snapshots from the latest CoinMarketCap quote response.</p>{markets.map((m) => <div key={m.symbol} style={{ padding: '12px 0', borderBottom: '1px solid #1e2a3c' }}><div style={{ display: 'flex', justifyContent: 'space-between' }}><strong>{m.symbol}</strong><span>{money.format(m.price)}</span></div><div style={{ display: 'flex', justifyContent: 'space-between', opacity: .7, fontSize: 12, marginTop: 4 }}><span>{m.change24h >= 0 ? 'Positive' : m.change24h < 0 ? 'Negative' : 'Flat'} 24h movement</span><span>{m.change24h >= 0 ? '+' : ''}{m.change24h.toFixed(2)}%</span></div><div style={{ opacity: .55, fontSize: 11, marginTop: 3 }}>24h volume {m.volume24h == null ? '—' : `$${compact.format(m.volume24h)}`}</div></div>)}</div>}
        {tab === 'watchlist' && <div style={cardStyle}><h2>⭐ Watchlist</h2><p style={{ opacity: .65 }}>Your Telegram-scoped assets are stored server-side.</p>{watchlist.length ? watchlist.map((item) => { const market = markets.find(m => m.symbol === item.symbol); return <button key={item.id} onClick={() => { setSelectedSymbol(item.symbol); setTab('trade'); }} style={{ ...cardStyle, width: '100%', display: 'flex', justifyContent: 'space-between', color: 'inherit', textAlign: 'left' }}><span><strong>{item.symbol}</strong>{market && <span style={{ opacity: .65, marginLeft: 8 }}>{money.format(market.price)}</span>}</span><span>{market ? `${market.change24h >= 0 ? '+' : ''}${market.change24h.toFixed(2)}%` : '—'}</span></button> }) : <div style={{ opacity: .6 }}>No assets saved yet. Add one from a market card.</div>}</div>}
        {tab === 'alerts' && <div style={cardStyle}><h2>🔔 Price Alerts</h2><div style={{ display: 'grid', gap: 8 }}><select value={alertSymbol} onChange={e => setAlertSymbol(e.target.value)} style={inputStyle}>{markets.map(m => <option key={m.symbol}>{m.symbol}</option>)}</select><select value={alertCondition} onChange={e => setAlertCondition(e.target.value as typeof alertCondition)} style={inputStyle}><option value="above">Price above</option><option value="below">Price below</option><option value="change24h">24h change reaches</option></select><input value={alertThreshold} onChange={e => setAlertThreshold(e.target.value)} inputMode="decimal" placeholder={alertCondition === 'change24h' ? 'e.g. 5 or -5' : 'Target price'} style={inputStyle} /><button onClick={() => void createAlert()} style={buttonStyle} disabled={busy}>Create Alert</button></div><div style={{ marginTop: 18 }}>{alerts.map(a => <div key={a.id} style={{ ...cardStyle, display: 'flex', justifyContent: 'space-between', gap: 8 }}><div><strong>{a.symbol}</strong><div style={{ opacity: .65 }}>{a.condition === 'above' ? 'Above' : a.condition === 'below' ? 'Below' : '24h change'} · {a.threshold}</div></div><button onClick={() => void removeAlert(a.id)} style={smallButtonStyle} disabled={busy}>Remove</button></div>)}</div></div>}
        {tab === 'auto' && <div style={cardStyle}><h2>🤖 Personal AI Agent</h2><p style={{ opacity: .7 }}>Tell CryptoPulse what you want monitored or prepared. Financial execution always requires explicit user authorization and an approved trading connection.</p><textarea value={agentInstruction} onChange={e => setAgentInstruction(e.target.value)} placeholder="Example: Monitor gold 24/7. If it falls 2%, alert me and prepare a $50 buy." style={{ ...inputStyle, minHeight: 110, resize: 'vertical' }} /><button onClick={() => void createAgentTask()} style={{ ...buttonStyle, marginTop: 10, width: '100%' }} disabled={busy || !agentInstruction.trim()}>{busy ? 'Creating…' : '🤖 Create Monitoring Task'}</button>{agentTaskMessage && <div style={{ marginTop: 10, opacity: .8 }}>{agentTaskMessage}</div>}<div style={{ marginTop: 12, padding: 12, borderRadius: 12, background: '#0b111d', opacity: .8 }}>Execution status: <strong>Authorized connections only</strong></div></div>}
        {tab === 'portfolio' && <div style={cardStyle}><h2>💼 Portfolio</h2><p style={{ opacity: .65 }}>No exchange account is connected to this Mini App. Portfolio balances and positions will appear here after secure server-side account integration is implemented.</p></div>}
        {tab === 'referral' && <div style={cardStyle}><h2>👥 Referral Center</h2><p style={{ opacity: .7 }}>Invite new users through Telegram and track real server-side referral activity.</p><button onClick={() => { goToSection('referral'); void track('referral_open'); }} style={buttonStyle}>Open Referral Center</button><div style={{ marginTop: 12, padding: 12, borderRadius: 12, background: '#0b111d', opacity: .65, fontSize: 12 }}>Referral attribution uses Telegram <code>startapp=ref_…</code> links and is recorded when the invited user opens the Mini App.</div></div>}
        {tab === 'pro' && (
          <div id="pro" style={cardStyle}>
            <h2>👑 CryptoPulse VIP — Personal Trading Agent</h2>
            <p style={{ opacity: 0.78 }}>VIP is open and simple. Tell CryptoPulse what you want in text or voice and the AI turns it into a task or workflow.</p>
            <div style={{ ...cardStyle, background: '#151026', borderColor: '#5b3aa8' }}>
              <strong>🎤 Examples</strong>
              <div style={{ display: 'grid', gap: 6, marginTop: 8, opacity: 0.85, fontSize: 13 }}>
                <span>• Monitor gold and alert me if it drops 2%.</span>
                <span>• Compare BTC and ETH every 4 hours.</span>
                <span>• Analyze this trade before I enter.</span>
                <span>• Create an automation for my market routine.</span>
                <span>• Design a task when I cannot find the right tool.</span>
              </div>
              <p style={{ marginBottom: 0, opacity: 0.72, fontSize: 12 }}>Real-money execution always requires an approved connection and explicit authorization.</p>
            </div>
            <h2 style={{ marginTop: 18 }}>⭐ CryptoPulse Pro & VIP</h2>
            <p style={{ opacity: 0.7 }}>Choose a plan. Payments are handled through Telegram Stars.</p>
            <div style={{ display: 'grid', gap: 10 }}>
              {(plans.length ? plans : [
                { code: 'pro_monthly', name: 'CryptoPulse Pro', description: 'Personal AI assistant and automation.', price_stars: 299, billing_period: 'monthly', recurring: true, features: ['AI assistant', 'Voice commands', 'Smart alerts'] },
                { code: 'pro_annual', name: 'CryptoPulse Pro Annual', description: '12-month Pro pass with 50% annual discount.', price_stars: 1794, billing_period: 'annual', recurring: false, features: ['Everything in Pro', '12 months', '50% discount'] },
                { code: 'vip_monthly', name: 'CryptoPulse VIP', description: 'Personal Trading Agent and advanced automation.', price_stars: 999, billing_period: 'monthly', recurring: true, features: ['Everything in Pro', 'Personal Trading Agent', '24/7 monitoring'] },
                { code: 'vip_annual', name: 'CryptoPulse VIP Annual', description: '12-month VIP pass with 50% annual discount.', price_stars: 5994, billing_period: 'annual', recurring: false, features: ['Everything in VIP', '12 months', '50% discount'] }
              ]).map((plan) => (
                <div key={plan.code} style={{ ...cardStyle, marginBottom: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                    <div><strong>{plan.name}</strong><div style={{ opacity: 0.65, fontSize: 12, marginTop: 4 }}>{plan.description}</div></div>
                    <strong>⭐{plan.price_stars}</strong>
                  </div>
                  <div style={{ opacity: 0.7, fontSize: 12, marginTop: 8 }}>{plan.features.join(' · ')}</div>
                  <button onClick={async () => {
                    setBusy(true);
                    setError('');
                    try {
                      const tg = getTelegramWebApp();
                      const response = await fetch('https://cryptopulse-pro-edge.hmcommercial1709.workers.dev/invoice', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'x-telegram-init-data': tg?.initData ?? '' },
                        body: JSON.stringify({ plan: plan.code }),
                      });
                      const body = await response.json() as { invoiceUrl?: string; error?: string };
                      if (!response.ok || !body.invoiceUrl) throw new Error(body.error ?? 'Unable to open Telegram checkout.');
                      if (tg?.openTelegramLink) tg.openTelegramLink(body.invoiceUrl);
                      else window.open(body.invoiceUrl, '_blank', 'noopener,noreferrer');
                      void track('plan_select', { plan: plan.code });
                    } catch (err) {
                      setError(err instanceof Error ? err.message : 'Unable to open Telegram checkout.');
                    } finally {
                      setBusy(false);
                    }
                  }} style={{ ...buttonStyle, marginTop: 10, width: '100%', background: plan.code.startsWith('vip') ? '#8b5cf6' : '#d97706' }} disabled={busy}>⭐ Choose {plan.name}</button>
                </div>
              ))}
            </div>
          </div>
        )}
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