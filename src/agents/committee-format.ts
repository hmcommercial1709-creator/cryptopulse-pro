import type { CommitteeReport } from './agent-types.js';

export function formatCommitteeReport(report: CommitteeReport): string {
  const lines = [
    `🧠 Committee Report — ${report.symbol}`,
    `Decision: ${report.decision}`,
    `Confidence: ${report.confidence === null ? 'n/a' : `${report.confidence.toFixed(1)}%`}`,
    '',
  ];
  for (const agent of report.agents) {
    lines.push(`${agent.agent.toUpperCase()}: ${agent.status}${agent.score === null ? '' : ` (${agent.score.toFixed(1)})`}`);
    for (const finding of agent.findings.slice(0, 3)) lines.push(`• ${finding.message}`);
  }
  lines.push('', report.summary, 'Execution: disabled — user wallet confirmation is required.');
  return lines.join('\n');
}
