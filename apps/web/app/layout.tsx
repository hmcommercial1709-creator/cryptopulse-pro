import type { Metadata } from 'next';

const site = 'https://cryptopulse.pro';
export const metadata: Metadata = {
  metadataBase: new URL(site),
  title: { default: 'CryptoPulse Pro — Crypto Market Intelligence & Risk Tools', template: '%s | CryptoPulse Pro' },
  description: 'Crypto market intelligence, risk management, alerts and beginner-friendly trading education in English and Arabic.',
  alternates: { canonical: '/', languages: { en: '/en', ar: '/ar', 'x-default': '/en' } },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1, 'max-video-preview': -1 } },
  openGraph: { type: 'website', siteName: 'CryptoPulse Pro', title: 'CryptoPulse Pro', description: 'Crypto market intelligence and risk tools in English and Arabic', url: site },
  twitter: { card: 'summary_large_image', title: 'CryptoPulse Pro', description: 'Crypto market intelligence and risk tools' },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
