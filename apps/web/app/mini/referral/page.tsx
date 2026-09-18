'use client';

import { useEffect, useMemo, useState } from 'react';

type Reward={threshold:number;stars:number;status:string;qualifyingPaidUsers:number};
type Commission={stars:number;paymentStars:number;status:string;createdAt:string};
type Leader={rank:number;name:string;qualifyingPaidUsers:number;accruedStars:number;isYou:boolean;vipTitle:string};
type Stats={
  referrals:number;
  activatedReferrals:number;
  sharedReferrals:number;
  paidNetworkUsers:number;
  networkUsers:number;
  accruedCommissionStars:number;
  levels?:{threshold:number;stars:number}[];
  rewards?:Reward[];
  recentCommissions?:Commission[];
};

export default function ReferralPage():JSX.Element{
  const [url,setUrl]=useState('');
  const [stats,setStats]=useState<Stats>({referrals:0,activatedReferrals:0,sharedReferrals:0,paidNetworkUsers:0,networkUsers:0,accruedCommissionStars:0,levels:[]});
  const [rate,setRate]=useState(15);
  const [message,setMessage]=useState('');
  const [leaderboard,setLeaderboard]=useState<Leader[]>([]);
  const [leaderboardUpdated,setLeaderboardUpdated]=useState('');

  useEffect(()=>{
    const headers={'x-telegram-init-data':window.Telegram?.WebApp?.initData??''};
    void fetch('/api/growth',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({event:'referral_open',metadata:{surface:'mini_referral'}})}).catch(()=>undefined);
    void Promise.all([
      fetch('/api/referral',{headers}).then(r=>r.json()),
      fetch('/api/referral/stats',{headers}).then(r=>r.json()),
      fetch('/api/referral/config',{headers}).then(r=>r.json()).catch(()=>({rate:15})),
      fetch('/api/referral/leaderboard',{headers}).then(r=>r.json()).catch(()=>({leaderboard:[]}))
    ]).then(([link,data,cfg,board])=>{
      if(link.url)setUrl(link.url);
      setRate(Number(cfg.rate??15));
      setLeaderboard(Array.isArray(board.leaderboard)?board.leaderboard:[]);
      setLeaderboardUpdated(String(board.updatedAt??''));
      setStats({
        referrals:Number(data.referrals??0),
        activatedReferrals:Number(data.activatedReferrals??0),
        sharedReferrals:Number(data.sharedReferrals??0),
        paidNetworkUsers:Number(data.paidNetworkUsers??0),
        networkUsers:Number(data.networkUsers??0),
        accruedCommissionStars:Number(data.accruedCommissionStars??0),
        levels:data.levels??[],
        rewards:data.rewards??[],
        recentCommissions:data.recentCommissions??[]
      });
    }).catch(()=>setMessage('Referral data is temporarily unavailable.'));
  },[]);

  const nextLevel=useMemo(()=>stats.levels?.find(l=>stats.paidNetworkUsers<l.threshold)??null,[stats.levels,stats.paidNetworkUsers]);

  const share=()=>{
    if(!url)return;
    const text=encodeURIComponent('🚀 Join CryptoPulse Pro and build your own referral group.');
    const shareUrl='https://t.me/share/url?url='+encodeURIComponent(url)+'&text='+text;
    if(window.Telegram?.WebApp?.openTelegramLink)window.Telegram.WebApp.openTelegramLink(shareUrl);
    else window.open(shareUrl,'_blank','noopener,noreferrer');
  };

  const copy=async()=>{
    if(!url)return;
    await navigator.clipboard?.writeText(url);
    setMessage('Referral link copied.');
  };

  return <main style={page}><section style={shell}>
    <button onClick={()=>{window.location.href='/mini';}} style={back}>← Back to CryptoPulse</button>

    <div style={hero}>
      <div style={{fontSize:12,opacity:.7,letterSpacing:1}}>CRYPTO PULSE PRO</div>
      <h1 style={{margin:'6px 0'}}>🚨 Referral & Rewards Center</h1>
      <p style={muted}>Turn your audience into a tracked referral network. Eligible paid activity is recorded transparently.</p>
      <div style={price}>🔥 {rate}% CryptoPulse program rate</div>
    </div>

    <div style={grid}>
      <div style={stat}><strong>{stats.referrals.toLocaleString()}</strong><span>Direct referrals</span></div>
      <div style={stat}><strong>{stats.paidNetworkUsers.toLocaleString()}</strong><span>Paid users in network</span></div>
      <div style={stat}><strong>{stats.accruedCommissionStars.toLocaleString()} ⭐</strong><span>Accrued commission</span></div>
    </div>

    <div style={card}>
      <h2 style={h2}>🔗 Your unique referral link</h2>
      <div style={linkBox}>{url||'Loading…'}</div>
      <div style={grid2}>
        <button onClick={()=>void copy()} style={button}>Copy link</button>
        <button onClick={share} style={button}>📤 Share</button>
      </div>
      <p style={fine}>Your link uses a Telegram bot start parameter so the referrer can be attributed when a new user starts CryptoPulse.</p>
    </div>

    <div style={card}>
      <h2 style={h2}>🏆 Milestones</h2>
      <p style={muted}>Milestones are based on qualifying paid users, not clicks or unpaid signups.</p>
      {(stats.levels??[]).map(l=>{
        const hit=stats.paidNetworkUsers>=l.threshold;
        return <div key={l.threshold} style={row}>
          <span>{hit?'✅':'🔒'} {l.threshold.toLocaleString()} paid users</span>
          <strong>{l.stars.toLocaleString()} ⭐</strong>
        </div>;
      })}
      {nextLevel&&<div style={next}>Next milestone: <strong>{nextLevel.threshold.toLocaleString()}</strong> paid users · {nextLevel.stars.toLocaleString()} ⭐</div>}
    </div>

    <div style={card}>
      <h2 style={h2}>👑 Global VIP Leaderboard</h2>
      <p style={muted}>Live qualifying leaderboard. Only eligible paid referral activity is counted; reviewed or blocked commissions are excluded.</p>
      {leaderboard.length===0 ? <p style={muted}>No qualifying paid activity yet.</p> : leaderboard.slice(0,25).map((r)=><div key={r.rank} style={row}>
        <span><strong>#{r.rank}</strong> {r.vipTitle} · {r.name}</span>
        <span>{r.qualifyingPaidUsers.toLocaleString()} paid · {r.accruedStars.toLocaleString()} ⭐</span>
      </div>)}
      {leaderboardUpdated&&<p style={fine}>Updated {new Date(leaderboardUpdated).toLocaleTimeString()}. Refreshes when this center is opened.</p>}
    </div>

    <div style={card}>
      <h2 style={h2}>💰 Commission activity</h2>
      {(stats.recentCommissions??[]).length===0
        ? <p style={muted}>No eligible commission has been recorded yet.</p>
        : (stats.recentCommissions??[]).map((c,i)=><div key={i} style={row}>
            <span>{new Date(c.createdAt).toLocaleDateString()}</span>
            <span>{c.paymentStars.toLocaleString()} ⭐ payment → <strong>{c.stars.toLocaleString()} ⭐</strong></span>
          </div>)}
    </div>

    <div style={card}>
      <h2 style={h2}>📜 Program rules</h2>
      <ol style={list}>
        <li>Share your personal referral link responsibly.</li>
        <li>A referral is attributed once a new Telegram user enters through the valid referral start parameter.</li>
        <li>Commission is accrued only from eligible Telegram Stars payments recorded by CryptoPulse and can be held for review when integrity checks detect unusual patterns.</li>
        <li>Unpaid signups, duplicate/self-referrals, refunds, fake accounts, manipulation and prohibited activity do not qualify.</li>
        <li>Accrued rewards are subject to verification and the configured payout process; accrued does not mean instantly paid.</li>
        <li>Telegram's native Mini App Affiliate Program is separate. CryptoPulse's internal rate and leaderboard are not a representation of Telegram's native commission.</li>
      </ol>
      <p style={fine}>For digital goods and services inside Telegram, Telegram requires Telegram Stars (XTR). Telegram also requires clear terms and support for bot payments. See the official Telegram documentation for the applicable rules.</p>
    </div>

    {message&&<div style={card}>{message}</div>}
  </section></main>;
}

const page:React.CSSProperties={minHeight:'100vh',background:'#070b14',color:'#f7f9fc',fontFamily:'system-ui,sans-serif',padding:16};
const shell:React.CSSProperties={maxWidth:680,margin:'0 auto'};
const hero:React.CSSProperties={background:'linear-gradient(135deg,#151f35,#101827)',border:'1px solid #2a3a55',borderRadius:20,padding:20,marginBottom:12};
const price:React.CSSProperties={fontSize:22,fontWeight:900,marginTop:12};
const card:React.CSSProperties={background:'#101827',border:'1px solid #1e2a3c',borderRadius:18,padding:16,marginBottom:10};
const stat:React.CSSProperties={background:'#101827',border:'1px solid #1e2a3c',borderRadius:16,padding:14,display:'flex',flexDirection:'column',gap:4};
const grid:React.CSSProperties={display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,marginBottom:10};
const grid2:React.CSSProperties={display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginTop:10};
const button:React.CSSProperties={border:0,borderRadius:10,padding:12,background:'#1769e0',color:'white',fontWeight:800,cursor:'pointer'};
const back:React.CSSProperties={border:0,borderRadius:10,padding:10,background:'#1a2332',color:'white',cursor:'pointer',marginBottom:12};
const linkBox:React.CSSProperties={marginTop:10,padding:12,borderRadius:10,background:'#0b111d',overflowWrap:'anywhere',opacity:.85,fontSize:13};
const muted:React.CSSProperties={opacity:.7,fontSize:13,lineHeight:1.6};
const fine:React.CSSProperties={opacity:.5,fontSize:11,lineHeight:1.5};
const h2:React.CSSProperties={marginTop:0};
const row:React.CSSProperties={padding:'11px 0',borderBottom:'1px solid #1e2a3c',display:'flex',justifyContent:'space-between',gap:10,alignItems:'center'};
const next:React.CSSProperties={marginTop:12,padding:12,borderRadius:10,background:'#0b111d'};
const list:React.CSSProperties={lineHeight:1.7,opacity:.85,paddingLeft:20};
