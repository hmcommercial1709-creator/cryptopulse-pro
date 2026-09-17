export type AgentIntent = {
  action: 'scan' | 'analyze' | 'execute';
  symbols: string[];
  chains: string[];
  amountUsd?: number;
  condition?: string;
  requiresConfirmation: boolean;
};

const SYMBOLS = ['BTC','ETH','SOL','TON','USDT','USDC','DOGE','XRP','ADA','AVAX','LINK','SUI'];
const CHAINS = ['ton','solana','ethereum','base','bnb','arbitrum','polygon'];

function firstNumber(text: string): number | undefined {
  const match = text.match(/(?:\$|usd\s*)?(\d+(?:\.\d+)?)/i);
  if (!match) return undefined;
  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

export function parseNaturalCommand(text: string): AgentIntent {
  const normalized = text.trim().toLowerCase();
  if (!normalized) throw new Error('Enter a market request.');

  const symbols = SYMBOLS.filter((symbol) => normalized.includes(symbol.toLowerCase()));
  const chains = CHAINS.filter((chain) => normalized.includes(chain));
  const amountUsd = firstNumber(normalized);
  const wantsExecute = /\b(buy|sell|swap|purchase|execute|trade|اشتر|بيع|بدل)\b/i.test(normalized);
  const wantsAnalyze = /\b(analy[sz]e|analysis|signal|momentum|زخم|حلل|تحليل)\b/i.test(normalized);

  return {
    action: wantsExecute ? 'execute' : wantsAnalyze ? 'analyze' : 'scan',
    symbols: symbols.length ? symbols : ['BTC','ETH','SOL'],
    chains,
    amountUsd,
    condition: /\b(stable|استقر|stabil)/i.test(normalized) ? 'price_stable' : undefined,
    requiresConfirmation: wantsExecute,
  };
}

export async function parseWithOptionalLLM(text: string): Promise<AgentIntent> {
  const fallback = parseNaturalCommand(text);
  const key = process.env.OPENAI_API_KEY;
  if (!key) return fallback;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.OPENAI_AGENT_MODEL ?? 'gpt-4o-mini',
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'Convert crypto trading requests into JSON with action scan|analyze|execute, symbols array, chains array, amountUsd number or null, condition string or null. Never invent symbols. Execute requires explicit user wording.' },
        { role: 'user', content: text },
      ],
    }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) return fallback;
  const body = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const content = body.choices?.[0]?.message?.content;
  if (!content) return fallback;
  try {
    const parsed = JSON.parse(content) as Partial<AgentIntent>;
    const action = parsed.action === 'execute' || parsed.action === 'analyze' || parsed.action === 'scan' ? parsed.action : fallback.action;
    const symbols = Array.isArray(parsed.symbols) ? parsed.symbols.map(String).map((s) => s.toUpperCase()).filter((s) => SYMBOLS.includes(s)) : fallback.symbols;
    const chains = Array.isArray(parsed.chains) ? parsed.chains.map(String).map((s) => s.toLowerCase()).filter((s) => CHAINS.includes(s)) : fallback.chains;
    const amountUsd = typeof parsed.amountUsd === 'number' && Number.isFinite(parsed.amountUsd) && parsed.amountUsd > 0 ? parsed.amountUsd : fallback.amountUsd;
    return { action, symbols: symbols.length ? symbols : fallback.symbols, chains, amountUsd, condition: typeof parsed.condition === 'string' ? parsed.condition.slice(0, 80) : fallback.condition, requiresConfirmation: action === 'execute' };
  } catch {
    return fallback;
  }
}
