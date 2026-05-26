/**
 * Counts approximate tokens in a text string.
 * Uses whitespace and punctuation splitting. No external tokenizer library.
 * @param text - The text to count tokens for
 * @returns Approximate token count
 */
export function countTokens(text: string): number {
  return text.split(/[\s\p{P}]+/u).filter(Boolean).length;
}

/**
 * Calculates credits from input token count.
 * Applies a multiplier to cover output token cost and margin.
 * 1 credit = 1,000 tokens after multiplier.
 * @param inputTokens - Number of input tokens
 * @param multiplier - Cost multiplier (default 1.45)
 * @returns Number of credits (rounded up)
 */
export function calculateCredits(inputTokens: number, multiplier: number = 1.45): number {
  return Math.ceil((inputTokens * multiplier) / 1000);
}
