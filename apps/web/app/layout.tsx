import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: { default: 'CryptoPulse Pro — Simple Crypto Market Intelligence', template: '%s | CryptoPulse Pro' },
  description: 'Understand crypto markets, risk, alerts and trading concepts in plain language with CryptoPulse Pro.',
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
