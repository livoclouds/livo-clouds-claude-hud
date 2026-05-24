import pricingData from './pricing.json' with { type: 'json' };

export type ModelPricing = {
  inputPerMTok: number;
  outputPerMTok: number;
  cacheWritePerMTok: number;
  cacheReadPerMTok: number;
  contextWindow: number;
};

export type ModelUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
};

export function pricingFor(model: string | null | undefined): ModelPricing {
  if (model) {
    for (const entry of pricingData.models) {
      if (model.startsWith(entry.match)) {
        return entry;
      }
    }
  }
  return pricingData.fallback;
}

export function computeCostUsd(model: string | null | undefined, usage: ModelUsage): number {
  const p = pricingFor(model);
  const million = 1_000_000;
  return (
    (usage.inputTokens * p.inputPerMTok) / million +
    (usage.outputTokens * p.outputPerMTok) / million +
    (usage.cacheCreationTokens * p.cacheWritePerMTok) / million +
    (usage.cacheReadTokens * p.cacheReadPerMTok) / million
  );
}

export function contextPctFor(model: string | null | undefined, usage: ModelUsage): number {
  const window = pricingFor(model).contextWindow;
  if (window <= 0) return 0;
  const total =
    usage.inputTokens + usage.outputTokens + usage.cacheReadTokens + usage.cacheCreationTokens;
  return Math.min(100, (total / window) * 100);
}
