import type { RehabLevel } from '@prisma/client';

const REHAB_COST_PER_SQFT: Record<
  RehabLevel,
  { min: number; max: number }
> = {
  LIGHT: { min: 10, max: 25 },
  MEDIUM: { min: 25, max: 50 },
  HEAVY: { min: 50, max: 80 },
  FULL_GUT: { min: 80, max: 120 },
};

export type DealCalcResult = {
  rehabCostLow: number;
  rehabCostMid: number;
  rehabCostHigh: number;
  mao: number;
  wholesaleProfit: number;
};

export function calculateDeal(input: {
  arv: number;
  rehabLevel: RehabLevel;
  sqft: number;
  assignmentFee?: number;
  arvMultiplier?: number;
}): DealCalcResult {
  const { arv, rehabLevel, sqft, assignmentFee = 10_000, arvMultiplier = 0.7 } = input;
  const range = REHAB_COST_PER_SQFT[rehabLevel];
  const rehabCostLow = range.min * sqft;
  const rehabCostHigh = range.max * sqft;
  const rehabCostMid = (rehabCostLow + rehabCostHigh) / 2;
  const mao = arv * arvMultiplier - rehabCostMid - assignmentFee;
  const wholesaleProfit = assignmentFee;
  return { rehabCostLow, rehabCostMid, rehabCostHigh, mao, wholesaleProfit };
}
