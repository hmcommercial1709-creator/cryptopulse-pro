'use client';

import { TonConnectButton, TonConnectUIProvider } from '@tonconnect/ui-react';

export default function WalletPage() {
  const manifestUrl = process.env.NEXT_PUBLIC_TONCONNECT_MANIFEST_URL;
  if (!manifestUrl) return <main style={{ minHeight: '100vh', background: '#070b14', color: '#f7f9fc', padding: 24, fontFamily: 'system-ui,sans-serif' }}><h1>🔗 TON Wallet</h1><p>TonConnect integration is installed and the wallet surface is ready. Set NEXT_PUBLIC_TONCONNECT_MANIFEST_URL to the final hosted TonConnect manifest before enabling wallet connections.</p></main>;
  return <TonConnectUIProvider manifestUrl={manifestUrl}><main style={{ minHeight: '100vh', background: '#070b14', color: '#f7f9fc', padding: 24, fontFamily: 'system-ui,sans-serif' }}><h1>🔗 Connect TON Wallet</h1><p style={{ opacity: .7 }}>Connect your wallet inside Telegram. Transaction signing remains under the wallet's explicit approval.</p><TonConnectButton /></main></TonConnectUIProvider>;
}
