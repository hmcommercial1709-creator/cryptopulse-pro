import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = 'https://cryptopulse.pro';
  const paths = ['', '/learn', '/risk-management', '/market-analysis', '/alerts'];
  return paths.map((path) => ({ url: `${base}${path}`, changeFrequency: path === '' ? 'daily' : 'weekly', priority: path === '' ? 1 : 0.8 }));
}
