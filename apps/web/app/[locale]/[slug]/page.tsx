import type { Metadata } from 'next';

const site = 'https://cryptopulse.pro';
const pages = ['learn', 'risk-management', 'market-analysis', 'alerts', 'crypto-for-beginners', 'bitcoin-analysis', 'ethereum-analysis', 'crypto-risk-calculator'];
const data: Record<string, { en: { title: string; description: string; h1: string }; ar: { title: string; description: string; h1: string } }> = {
  learn: { en: { title: 'Learn Crypto Trading', description: 'A practical crypto trading education hub covering market basics, indicators, volatility and risk.', h1: 'Learn Crypto Trading' }, ar: { title: 'تعلّم تداول العملات الرقمية', description: 'دليل عملي لتعلّم أساسيات السوق والمؤشرات والتذبذب وإدارة المخاطر.', h1: 'تعلّم تداول العملات الرقمية' } },
  'risk-management': { en: { title: 'Crypto Risk Management', description: 'Learn position sizing, stop-loss concepts, risk-reward and maximum-loss planning.', h1: 'Crypto Risk Management' }, ar: { title: 'إدارة مخاطر العملات الرقمية', description: 'تعلّم حجم الصفقة ووقف الخسارة والعائد إلى المخاطرة وتحديد أقصى خسارة.', h1: 'إدارة مخاطر العملات الرقمية' } },
  'market-analysis': { en: { title: 'Crypto Market Analysis', description: 'Understand trend, momentum, volatility, volume, RSI, MACD, moving averages and market structure.', h1: 'Crypto Market Analysis' }, ar: { title: 'تحليل سوق العملات الرقمية', description: 'افهم الاتجاه والزخم والتذبذب والحجم وRSI وMACD والمتوسطات وبنية السوق.', h1: 'تحليل سوق العملات الرقمية' } },
  alerts: { en: { title: 'Crypto Price Alerts', description: 'Learn how crypto price and market-condition alerts work and how to use them responsibly.', h1: 'Crypto Price Alerts' }, ar: { title: 'تنبيهات أسعار العملات الرقمية', description: 'تعرّف إلى تنبيهات الأسعار وحالات السوق وكيفية استخدامها بمسؤولية.', h1: 'تنبيهات أسعار العملات الرقمية' } },
  'crypto-for-beginners': { en: { title: 'Crypto for Beginners', description: 'A beginner-friendly guide to crypto markets, wallets, volatility, orders and risk.', h1: 'Crypto for Beginners' }, ar: { title: 'العملات الرقمية للمبتدئين', description: 'دليل مبسط للأسواق والمحافظ والتذبذب والأوامر وإدارة المخاطر.', h1: 'العملات الرقمية للمبتدئين' } },
  'bitcoin-analysis': { en: { title: 'Bitcoin Analysis Guide', description: 'Understand the main market factors used when analyzing Bitcoin without guaranteed predictions.', h1: 'Bitcoin Analysis Guide' }, ar: { title: 'دليل تحليل بيتكوين', description: 'افهم العوامل الرئيسية لتحليل بيتكوين دون ادعاءات بتوقعات مضمونة.', h1: 'دليل تحليل بيتكوين' } },
  'ethereum-analysis': { en: { title: 'Ethereum Analysis Guide', description: 'A practical guide to analyzing Ethereum price, momentum, volatility and risk.', h1: 'Ethereum Analysis Guide' }, ar: { title: 'دليل تحليل إيثريوم', description: 'دليل عملي لتحليل سعر إيثريوم والزخم والتذبذب والمخاطر.', h1: 'دليل تحليل إيثريوم' } },
  'crypto-risk-calculator': { en: { title: 'Crypto Position Size & Risk Calculator', description: 'Calculate maximum loss and position size from balance, risk percentage, entry and stop-loss.', h1: 'Crypto Risk Calculator' }, ar: { title: 'حاسبة حجم الصفقة ومخاطر العملات الرقمية', description: 'احسب أقصى خسارة وحجم الصفقة من الرصيد ونسبة المخاطرة والدخول ووقف الخسارة.', h1: 'حاسبة مخاطر العملات الرقمية' } },
};

export async function generateStaticParams() { return ['en', 'ar'].flatMap((locale) => pages.map((slug) => ({ locale, slug }))); }
export async function generateMetadata({ params }: { params: Promise<{ locale: 'en' | 'ar'; slug: string }> }): Promise<Metadata> {
  const { locale, slug } = await params; const item = data[slug]?.[locale];
  if (!item) return { robots: { index: false, follow: true } };
  return { title: item.title, description: item.description, alternates: { canonical: `${site}/${locale}/${slug}`, languages: { en: `${site}/en/${slug}`, ar: `${site}/ar/${slug}`, 'x-default': `${site}/en/${slug}` } } };
}

export default async function TopicPage({ params }: { params: Promise<{ locale: 'en' | 'ar'; slug: string }> }) {
  const { locale, slug } = await params; const item = data[slug]?.[locale]; if (!item) return null; const rtl = locale === 'ar';
  const jsonLd = { '@context': 'https://schema.org', '@type': 'Article', headline: item.h1, description: item.description, inLanguage: locale, mainEntityOfPage: `${site}/${locale}/${slug}`, author: { '@type': 'Organization', name: 'CryptoPulse Pro' }, publisher: { '@type': 'Organization', name: 'CryptoPulse Pro' } };
  return <main dir={rtl ? 'rtl' : 'ltr'} style={{ maxWidth: 900, margin: '0 auto', padding: 32, fontFamily: 'system-ui' }}>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    <nav><a href={`/${locale}`}>{locale === 'ar' ? 'الرئيسية' : 'Home'}</a> · <a href={locale === 'ar' ? '/en' : '/ar'}>{locale === 'ar' ? 'English' : 'العربية'}</a></nav>
    <h1>{item.h1}</h1><p>{item.description}</p>
    <h2>{locale === 'ar' ? 'ما الذي ستتعلمه؟' : 'What you will learn'}</h2>
    <p>{locale === 'ar' ? 'نشرح المفاهيم الأساسية ثم نربطها بإدارة المخاطر والبيانات الفعلية. لا نستخدم وعود الأرباح أو توقعات مضمونة.' : 'We explain the core concepts, then connect them to risk management and real market data. We do not use guaranteed-profit claims or guaranteed predictions.'}</p>
    <h2>{locale === 'ar' ? 'ملاحظة مهمة' : 'Important note'}</h2><p>{locale === 'ar' ? 'الأسواق شديدة التقلب. استخدم المعلومات للتعلم واتخاذ قراراتك بنفسك.' : 'Markets are volatile. Use the information to learn and make your own decisions.'}</p>
  </main>;
}
