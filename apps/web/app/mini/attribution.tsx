'use client';

import { useEffect } from 'react';

type TelegramWebApp = {
  initData?: string;
  initDataUnsafe?: { start_param?: string };
};

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

function getStartParam(): string {
  const fromTelegram = window.Telegram?.WebApp?.initDataUnsafe?.start_param;
  if (fromTelegram) return fromTelegram;
  return new URLSearchParams(window.location.search).get('tgWebAppStartParam') ?? '';
}

export default function StartAppAttribution(): null {
  useEffect(() => {
    const startParam = getStartParam().trim().slice(0, 128);
    if (!startParam) return;
    const initData = window.Telegram?.WebApp?.initData ?? '';
    if (!initData) return;

    const key = `cryptopulse:startapp:${startParam}`;
    if (window.sessionStorage.getItem(key)) return;
    window.sessionStorage.setItem(key, '1');

    const source = startParam.startsWith('momentum_')
      ? 'momentum'
      : startParam.startsWith('share_')
        ? 'share'
        : startParam.startsWith('ref_')
          ? 'referral'
          : 'startapp';

    void fetch('/api/growth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-telegram-init-data': initData },
      body: JSON.stringify({
        event: 'startapp_open',
        source,
        metadata: { startParam },
      }),
    }).catch(() => undefined);
  }, []);

  return null;
}
