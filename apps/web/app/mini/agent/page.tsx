'use client';

import { useState } from 'react';

type Intent = { action: string; symbols: string[]; chains: string[]; amountUsd?: number; condition?: string; requiresConfirmation: boolean };

export default function AgentPage() {
  const [text, setText] = useState('Scan Solana and TON for unusual momentum and volume, then analyze the strongest symbols.');
  const [intent, setIntent] = useState<Intent | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true); setError('');
    try {
      const initData = window.Telegram?.WebApp?.initData ?? '';
      const response = await fetch('/api/agent', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-telegram-init-data': initData }, body: JSON.stringify({ text }) });
      const body = await response.json() as { intent?: Intent; error?: string };
      if (!response.ok || !body.intent) throw new Error(body.error ?? 'Agent request failed.');
      setIntent(body.intent);
    } catch (e) { setError(e instanceof Error ? e.message : 'Agent request failed.'); }
    finally { setBusy(false); }
  }

  return <main style={{ minHeight: '100vh', background: '#070b14', color: '#f7f9fc', padding: 18, fontFamily: 'system-ui,sans-serif' }}><section style={{ maxWidth: 680, margin: '0 auto' }}><h1>🤖 CryptoPulse Agent</h1><p style={{ opacity: .65 }}>Describe the scan or analysis you want in normal language.</p><textarea value={text} onChange={e => setText(e.target.value)} rows={6} style={{ width: '100%', padding: 14, borderRadius: 14, background: '#101827', color: 'inherit', border: '1px solid #26354a', boxSizing: 'border-box' }} /><button onClick={() => void run()} disabled={busy} style={{ marginTop: 12, width: '100%', padding: 14, borderRadius: 12, border: 0, fontWeight: 800 }}>{busy ? 'Thinking…' : 'Run Agent'}</button>{error && <p style={{ color: '#ff6678' }}>{error}</p>}{intent && <div style={{ marginTop: 18, padding: 16, borderRadius: 16, background: '#101827', border: '1px solid #26354a' }}><h2>Execution Plan</h2><p><strong>Action:</strong> {intent.action}</p><p><strong>Assets:</strong> {intent.symbols.join(', ')}</p><p><strong>Networks:</strong> {intent.chains.length ? intent.chains.join(', ') : 'not specified'}</p>{intent.amountUsd && <p><strong>Amount:</strong> ${intent.amountUsd}</p>}{intent.condition && <p><strong>Condition:</strong> {intent.condition}</p>}<p><strong>Confirmation required:</strong> {intent.requiresConfirmation ? 'Yes — explicit confirmation before execution' : 'No execution requested'}</p>{intent.requiresConfirmation && <button disabled style={{ marginTop: 8, width: '100%', padding: 12, borderRadius: 10 }}>Execution connector pending wallet confirmation</button>}</div>}</section></main>;
}

declare global { interface Window { Telegram?: { WebApp?: { initData?: string } } } }
