import type { Metadata } from 'next';
import Script from 'next/script';

export const metadata: Metadata = {
  title: { default: 'CryptoPulse Pro — Crypto Market Intelligence & Risk Tools', template: '%s | CryptoPulse Pro' },
  description: 'Crypto market intelligence, risk management, alerts and beginner-friendly trading education in English and Arabic.',
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1, 'max-video-preview': -1 } },
  openGraph: { type: 'website', siteName: 'CryptoPulse Pro', title: 'CryptoPulse Pro', description: 'Crypto market intelligence and risk tools in English and Arabic' },
  twitter: { card: 'summary_large_image', title: 'CryptoPulse Pro', description: 'Crypto market intelligence and risk tools' },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}<Script src="https://telegram.org/js/telegram-web-app.js?63" strategy="beforeInteractive" /></body></html>;
}
