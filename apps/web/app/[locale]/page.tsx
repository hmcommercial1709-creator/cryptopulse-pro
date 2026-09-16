import type { Metadata } from 'next';

const site = 'https://cryptopulse.pro';
const copy = {
  en: { title: 'Crypto Trading & Market Intelligence', description: 'Crypto market analysis, risk management, alerts and beginner trading education in plain English.', h1: 'Crypto markets, explained clearly.', intro: 'Understand price action, risk, volatility, indicators and alerts before you make a decision.', topics: ['Crypto for Beginners', 'Risk Management', 'Market Analysis', 'Crypto Alerts'] },
  ar: { title: 'تحليل العملات الرقمية وإدارة المخاطر', description: 'تحليل سوق العملات الرقمية، إدارة المخاطر، التنبيهات وتعليم التداول باللغة العربية الواضحة.', h1: 'سوق العملات الرقمية، بشرح واضح.', intro: 'افهم حركة السعر والمخاطر والتذبذب والمؤشرات والتنبيهات قبل اتخاذ أي قرار.', topics: ['تعلّم العملات الرقمية', 'إدارة المخاطر', 'تحليل السوق', 'تنبيهات العملات'] },
} as const;

export async function generateStaticParams() { return [{ locale: 'en' }, { locale: 'ar' }]; }
export async function generateMetadata({ params }: { params: Promise<{ locale: 'en' | 'ar' }> }): Promise<Metadata> {
  const { locale } = await params; const c = copy[locale];
  return { title: c.title, description: c.description, alternates: { canonical: `${site}/${locale}`, languages: { en: `${site}/en`, ar: `${site}/ar`, 'x-default': `${site}/en` } } };
}

export default async function LocaleHome({ params }: { params: Promise<{ locale: 'en' | 'ar' }> }) {
  const { locale } = await params; const c = copy[locale]; const rtl = locale === 'ar';
  const jsonLd = { '@context': 'https://schema.org', '@type': 'WebSite', name: 'CryptoPulse Pro', url: `${site}/${locale}`, inLanguage: locale, description: c.description, potentialAction: { '@type': 'SearchAction', target: `${site}/${locale}/search?q={search_term_string}`, 'query-input': 'required name=search_term_string' } };
  return <main dir={rtl ? 'rtl' : 'ltr'} style={{ maxWidth: 1120, margin: '0 auto', padding: 32, fontFamily: 'system-ui' }}>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    <p>CRYPTOPULSE PRO</p><h1>{c.h1}</h1><p>{c.intro}</p>
    <nav aria-label="Language"><a href="/en">English</a> · <a href="/ar">العربية</a></nav>
    <section>{c.topics.map((topic) => <article key={topic}><h2>{topic}</h2><p>{locale === 'ar' ? 'دليل عملي واضح مع أمثلة ومفاهيم قابلة للفهم.' : 'Practical guides with clear explanations, examples and useful tools.'}</p></article>)}</section>
    <p><strong>{locale === 'ar' ? 'تنبيه المخاطر:' : 'Risk notice:'}</strong> {locale === 'ar' ? 'العملات الرقمية متقلبة ولا توجد ضمانات للربح.' : 'Crypto markets are volatile and no profit is guaranteed.'}</p>
  </main>;
}
