export type Locale = 'en' | 'ar';

export function getLocale(languageCode?: string): Locale {
  return languageCode?.toLowerCase().startsWith('ar') ? 'ar' : 'en';
}

const text = {
  en: {
    start: '🚀 CryptoPulse Pro\n\nA beginner-friendly crypto command center.\n\nChoose what you want to do:',
    markets: '📊 Markets', trade: '🧭 Trade Helper', alerts: '🔔 Alerts', learn: '📚 Learn Trading', pro: '💎 Pro', help: 'ℹ️ Help', home: '🏠 Home',
    snapshot: '📊 Market snapshot', liveReady: 'Live provider integration is being prepared.',
    tradeIntro: '🧭 Trade Helper\n\nChoose a risk profile. CryptoPulse explains the plan in plain language; it does not predict guaranteed outcomes.',
    low: '🟢 Beginner / Low risk', medium: '🟡 Balanced / Medium', high: '🔴 Advanced / High',
    plan: '🧠 BTC educational plan', direction: 'Direction', reference: 'Reference price', stop: 'Stop-loss example', target: 'Target example', risk: 'Risk level', rr: 'Risk/reward model',
    retry: '🔄 Try another level', learnText: '📚 Trading made simple\n\n1. Choose an asset.\n2. Understand trend and volatility.\n3. Decide how much you can afford to lose.\n4. Define a stop before entering.\n5. Never risk money you cannot afford to lose.',
    alertsText: '🔔 Alerts\n\nAlert infrastructure is ready. Live price-provider integration and persistent user alerts are next.',
    proText: '💎 CryptoPulse Pro\n\nPremium digital features will use Telegram Stars. No guaranteed-profit claims or hidden charges.',
    helpText: 'ℹ️ Help\n\nCryptoPulse Pro provides market information and educational trading tools. It does not guarantee profits and is not a substitute for professional financial advice.',
    riskNote: '⚠️ Educational information only. Crypto markets are volatile; this is not a profit guarantee or personalized financial advice.',
  },
  ar: {
    start: '🚀 CryptoPulse Pro\n\nمركز مبسّط لمعلومات وتحليل سوق العملات الرقمية، مصمم للمبتدئ والمحترف.\n\nاختر ما تريد القيام به:',
    markets: '📊 الأسواق', trade: '🧭 مساعد التداول', alerts: '🔔 التنبيهات', learn: '📚 تعلّم التداول', pro: '💎 برو', help: 'ℹ️ المساعدة', home: '🏠 الرئيسية',
    snapshot: '📊 لقطة السوق', liveReady: 'يتم تجهيز ربط مزوّد بيانات السوق المباشر.',
    tradeIntro: '🧭 مساعد التداول\n\nاختر مستوى المخاطرة. سيشرح CryptoPulse الخطة بلغة واضحة، ولا يدّعي ضمان النتائج.',
    low: '🟢 مبتدئ / مخاطرة منخفضة', medium: '🟡 متوازن / متوسطة', high: '🔴 متقدم / مرتفعة',
    plan: '🧠 خطة تعليمية لـ BTC', direction: 'الاتجاه', reference: 'السعر المرجعي', stop: 'مثال وقف الخسارة', target: 'مثال الهدف', risk: 'مستوى المخاطرة', rr: 'نموذج العائد إلى المخاطرة',
    retry: '🔄 جرّب مستوى آخر', learnText: '📚 التداول ببساطة\n\n1. اختر الأصل.\n2. افهم الاتجاه والتذبذب.\n3. حدد المبلغ الذي يمكنك تحمّل خسارته.\n4. حدّد وقف الخسارة قبل الدخول.\n5. لا تخاطر بأموال لا تستطيع تحمّل خسارتها.',
    alertsText: '🔔 التنبيهات\n\nبنية التنبيهات جاهزة. الخطوة التالية هي ربط بيانات الأسعار المباشرة وحفظ تنبيهات المستخدمين.',
    proText: '💎 CryptoPulse Pro\n\nستستخدم الميزات الرقمية المدفوعة Telegram Stars. لا توجد وعود بأرباح مضمونة أو رسوم مخفية.',
    helpText: 'ℹ️ المساعدة\n\nيوفر CryptoPulse معلومات سوق وأدوات تعليمية للتداول. لا يضمن الأرباح ولا يحل محل الاستشارة المالية المتخصصة.',
    riskNote: '⚠️ معلومات تعليمية فقط. أسواق العملات الرقمية شديدة التقلب؛ هذه ليست ضمانًا للربح ولا نصيحة مالية شخصية.',
  },
} as const;

export function t(locale: Locale) { return text[locale]; }
