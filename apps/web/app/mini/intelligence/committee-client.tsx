'use client';

import { useEffect, useState } from 'react';

type Report = {
  symbol: string;
  decision: string;
  confidence: number | null;
  report: {
    summary: string;
    agents: Array<{ agent: string; status: string; score: number | null; confidence: number | null }>;
    executionAllowed: false;
  };
  generated_at: string;
};

export default function CommitteeClient(): JSX.Element {
  const [symbol, setSymbol] = useState('BTC');
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);

  async function load(value: string): Promise<void> {
    setLoading(true);
    try {
      const response = await fetch(`/api/committee?symbol=${encodeURIComponent(value)}`, { cache: 'no-store' });
      const data = await response.json() as { report?: Report | null };
      setReport(data.report ?? null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(symbol); }, [symbol]);

  return (
    <main>
      <h1>Market Intelligence</h1>
      <label>
        Asset
        <select value={symbol} onChange={(event) => setSymbol(event.target.value)}>
          <option>BTC</option><option>ETH</option><option>SOL</option><option>TON</option><option>XRP</option>
        </select>
      </label>
      {loading && <p>Loading latest committee report…</p>}
      {!loading && !report && <p>No persisted committee report is available for this asset yet.</p>}
      {report && (
        <section>
          <h2>{report.symbol} · {report.decision}</h2>
          <p>Confidence: {report.confidence ?? 'n/a'}</p>
          <p>{report.report.summary}</p>
          {report.report.agents.map((agent) => (
            <div key={agent.agent}>
              <strong>{agent.agent}</strong>: {agent.status} · score {agent.score ?? 'n/a'} · confidence {agent.confidence ?? 'n/a'}
            </div>
          ))}
          <p>Execution: disabled. User wallet confirmation remains required.</p>
        </section>
      )}
    </main>
  );
}
