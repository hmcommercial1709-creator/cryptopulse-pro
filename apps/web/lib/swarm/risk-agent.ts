import type { AgentFinding, SwarmContext } from './types';

const knownChains = new Set(['ethereum', 'base', 'arbitrum', 'polygon', 'bnb', 'solana', 'ton']);

export function runRiskAgent(context: SwarmContext): AgentFinding {
  const supportedChains = context.chains.filter((chain) => knownChains.has(chain));
  const hasContractAddress = false;
  if (!hasContractAddress) {
    return {
      agent: 'risk',
      status: 'partial',
      title: 'Contract-risk scan requires a verified contract address',
      details: [
        'No contract address was supplied, so honeypot, ownership, blacklist, proxy and tax checks were not asserted.',
        supportedChains.length ? `Requested networks: ${supportedChains.join(', ')}.` : 'No supported network was specified.',
      ],
      evidence: { contractAddressProvided: false, supportedChains: supportedChains.length },
    };
  }
  return {
    agent: 'risk',
    status: 'ready',
    score: 0,
    title: 'Contract risk scan completed',
    details: [],
    evidence: {},
  };
}
