import { redirect } from 'next/navigation';

// The Worker root is the public Mini App entrypoint. Never send Telegram users
// to the informational /en landing page; that page is intentionally web/SEO-only.
export default function Home() {
  redirect('/mini');
}
