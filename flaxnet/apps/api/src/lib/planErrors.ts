/** User-facing paywall copy (keep in sync with web upgrade interceptor). */
export const PAYWALL_MESSAGE = "You've reached your limit. Upgrade to continue.";

export class PlanLimitExceededError extends Error {
  override readonly name = 'PlanLimitExceededError';
  constructor() {
    super('PlanLimitExceededError');
  }
}
