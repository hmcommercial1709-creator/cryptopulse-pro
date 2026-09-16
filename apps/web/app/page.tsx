const topics = [
  ['Crypto for Beginners', 'Learn the basics without needing trading experience.'],
  ['Risk Management', 'Understand position size, stop-losses and risk before acting.'],
  ['Market Analysis', 'Learn how price, volume, volatility and trend fit together.'],
  ['Crypto Alerts', 'Understand how price alerts and market notifications work.'],
];

export default function Home() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'CryptoPulse Pro',
    description: 'Crypto market intelligence and beginner trading education.',
  };
  return <main style={{ maxWidth: 1100, margin: '0 auto', padding: 32, fontFamily: 'system-ui' }}>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    <p>CRYPTO PULSE PRO</p>
    <h1>Crypto trading explained simply.</h1>
    <p>Market information, risk tools, alerts and education designed so a complete beginner can understand what each number means before taking action.</p>
    <section>{topics.map(([title, text]) => <article key={title}><h2>{title}</h2><p>{text}</p></article>)}</section>
    <p><strong>Risk notice:</strong> Crypto markets are volatile. CryptoPulse Pro does not guarantee profits or outcomes.</p>
  </main>;
}
