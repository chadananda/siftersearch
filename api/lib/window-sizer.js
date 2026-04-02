/**
 * Compute the sliding window size N for enrichment batches.
 * Config keys use snake_case to match test fixtures (max_window_tokens_hard_limit).
 * Defaults: budgetFraction=0.5, reservedDecodeTokens=0, instructionsTokens=0, bookMetaTokens=0.
 */
export const computeWindowN = (config) => {
  const {
    kvBudgetTokens,
    budgetFraction = 0.5,
    reservedDecodeTokens = 0,
    reservedParallelRequests = 1,
    avgParagraphTokens,
    avgObjectTokensPerPara = 0,
    instructionsTokens = 0,
    bookMetaTokens = 0,
    max_window_tokens_hard_limit,
    // camelCase alias for compatibility with spec description
    maxWindowTokensHardLimit
  } = config;
  const hardLimit = max_window_tokens_hard_limit ?? maxWindowTokensHardLimit ?? Infinity;
  // Divide KV budget among parallel requests, then subtract per-request overheads
  const usable = Math.floor((kvBudgetTokens * budgetFraction) / reservedParallelRequests)
    - reservedDecodeTokens
    - instructionsTokens
    - bookMetaTokens;
  const tokensPerUnit = avgParagraphTokens + avgObjectTokensPerPara;
  const twoNFromBudget = Math.floor(usable / tokensPerUnit);
  const twoNFromHardLimit = Math.floor(hardLimit / tokensPerUnit);
  const twoN = Math.min(twoNFromBudget, twoNFromHardLimit);
  const N = Math.max(Math.floor(twoN / 2), 3);
  return { N, twoN, tokensPerUnit, usable };
};
