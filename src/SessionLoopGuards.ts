/**
 * Pure guard functions for the terminal tutoring REPL's session loop (see
 * main.ts). Kept dependency-free so they're unit-testable in isolation from
 * the Anthropic SDK, readline, and process I/O.
 */

/**
 * Appends a student/tutor exchange turn to the rolling transcript buffer,
 * trimming from the front once `maxLines` is exceeded. Without this cap the
 * buffer grows once per retry attempt with no bound — a stuck student or a
 * persistently failing API connection would otherwise let it grow for the
 * entire lifetime of a single problem.
 */
export function appendExchangeTurn(
  recentExchangeLines: string[],
  studentInput:        string,
  assistantReply:      string,
  maxLines:             number,
): void {
  recentExchangeLines.push(`Student: ${studentInput}`);
  recentExchangeLines.push(`Tutor: ${assistantReply}`);

  const overflowCount = recentExchangeLines.length - maxLines;
  if (overflowCount > 0) {
    recentExchangeLines.splice(0, overflowCount);
  }
}

/**
 * True once consecutive API failures (errors or stream timeouts) reach the
 * circuit-breaker threshold. Signals the caller to stop retrying against a
 * dead connection and end the session gracefully instead of looping forever
 * on student input that can never succeed.
 */
export function hasExceededFailureBudget(
  consecutiveApiFailures:    number,
  maxConsecutiveApiFailures: number,
): boolean {
  return consecutiveApiFailures >= maxConsecutiveApiFailures;
}
