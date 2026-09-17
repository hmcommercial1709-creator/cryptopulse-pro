import { runExecutionAgent } from './execution-agent';
import { runLiquidityAgent } from './liquidity-agent';
import { runRiskAgent } from './risk-agent';
import type { SwarmContext, SwarmReport } from './types';

export async function runInstitutionalSwarm(context: SwarmContext): Promise<SwarmReport> {
  const [risk, liquidity, execution] = await Promise.all([
    Promise.resolve(runRiskAgent(context)),
    runLiquidityAgent(context),
    runExecutionAgent(context),
  ]);
  const findings = [risk, liquidity, execution];
  const readyCount = findings.filter((item) => item.status === 'ready').length;
  const partialCount = findings.filter((item) => item.status === 'partial').length;
  const blockers = findings.filter((item) => item.status !== 'ready').map((item) => item.title);
  const confidence = Math.round(((readyCount * 1) + (partialCount * 0.65)) / findings.length * 100);
  return {
    generatedAt: new Date().toISOString(),
    context,
    findings,
    committee: {
      status: blockers.length ? 'partial' : 'ready',
      summary: blockers.length
        ? `Committee report is partial: ${blockers.join('; ')}`
        : 'Committee report is complete for the supplied evidence.',
      confidence,
      blockers,
    },
  };
}
