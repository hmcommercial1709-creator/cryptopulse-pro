'use client';

import { useEffect, useState } from 'react';

type Stats = { referrals: number; activatedReferrals: number; sharedReferrals: number };

export default function ReferralPage(): JSX.Element {
  const [url, setUrl] = useState('');
  const [stats, setStats] = useState<Stats>({ referrals: 0, activatedReferrals: 0, sharedReferrals: 0 });
  const [message, setMessage] = useState('');

  useEffect(() => {
    const headers = { 'x-telegram-init-data': window.Telegram?.WebApp?.initData ?? '' };
    void Promise.all([
      fetch('/api/referral', { headers }).then((r) => r.json() as Promise<{ url?: string }>),
      fetch('/api/referral/stats', { headers }).then((r) => r.json() as Promise<Stats>),
    ]).then(([link, data]) => {
      if (link.url) setUrl(link.url);
      setStats({
        referrals: Number(data.referrals ?? 0),
        activatedReferrals: Number(data.activatedReferrals ?? 0),
        sharedReferrals: Number(data.sharedReferrals ?? 0),
      });
    }).catch(() => setMessage('Referral data is temporarily unavailable.'));
  }, []);

  const share = () => {
    if (!url) return;
    const text = encodeURIComponent('Join me on CryptoPulse for live crypto market intelligence inside Telegram.');
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${text}`;
    if (window.Telegram?.WebApp?.openTelegramLink) window.Telegram.WebApp.openTelegramLink(shareUrl);
    else window.open(shareUrl, '_blank', 'noopener,noreferrer');
  };

  const copy = async () => {
    if (!url) return;
    await navigator.clipboard?.writeText(url);
    setMessage('Referral link copied.');
  };

  return (
    <main style={{ minHeight: '100vh', background: '#070b14', color: '#f7f9fc', fontFamily: 'system-ui, sans-serif', padding: 16 }}>
      <section style={{ maxWidth: 620, margin: '0 auto' }}>
        <h1>🚀 CryptoPulse Growth</h1>
        <p style={{ opacity: .65 }}>Invite people directly through Telegram and track real activations.</p>
        <div style={card}><strong>Your referral link</strong><div style={linkBox}>{url || 'Loading…'}</div><div style={grid}><button onClick={() => void copy()} style={button}>Copy link</button><button onClick={share} style={button}>📤 Share on Telegram</button></div></div>
        <div style={grid}>
          <div style={card}><strong>{stats.referrals}</strong><div style={muted}>Referrals</div></div>
          <div style={card}><strong>{stats.activatedReferrals}</strong><div style={muted}>Activated</div></div>
          <div style={card}><strong>{stats.sharedReferrals}</strong><div style={muted}>First shares</div></div>
        </div>
        {message && <div style={{ ...card, opacity: .8 }}>{message}</div>}
        <p style={{ opacity: .45, fontSize: 12 }}>Counts are server-side events recorded by CryptoPulse. No guaranteed earnings or rewards are implied.</p>
      </section>
    </main>
  );
}

const card: React.CSSProperties = { background: '#101827', border: '1px solid #1e2a3c', borderRadius: 18, padding: 16, marginBottom: 10 };
const linkBox: React.CSSProperties = { marginTop: 10, padding: 12, borderRadius: 10, background: '#0b111d', overflowWrap: 'anywhere', opacity: .8, fontSize: 13 };
const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 10 };
const button: React.CSSProperties = { border: 0, borderRadius: 10, padding: 11, background: '#1769e0', color: 'white', fontWeight: 700, cursor: 'pointer' };
const muted: React.CSSProperties = { opacity: .55, fontSize: 12, marginTop: 4 };
