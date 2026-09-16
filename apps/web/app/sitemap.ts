import type { MetadataRoute } from 'next';

const base = 'https://cryptopulse.pro';
const topics = ['learn', 'risk-management', 'market-analysis', 'alerts', 'crypto-for-beginners', 'bitcoin-analysis', 'ethereum-analysis', 'crypto-risk-calculator'];
export default function sitemap(): MetadataRoute.Sitemap {
  const urls = ['', '/en', '/ar', ...topics.flatMap((topic) => [`/en/${topic}`, `/ar/${topic}`])];
  return urls.map((path) => ({ url: `${base}${path}`, lastModified: new Date(), changeFrequency: path === '' ? 'daily' : 'weekly', priority: path === '' ? 1 : path.split('/').length === 2 ? 0.9 : 0.75 }));
}
