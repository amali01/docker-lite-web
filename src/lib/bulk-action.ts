import { toast } from "sonner";

export interface BulkActionOutcome<T> {
  succeeded: T[];
  failed: T[];
}

function pluralize(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/**
 * Runs `perform` over every item and reports what actually happened.
 *
 * The pages used to run these loops inside a single `try`, so the first failure
 * abandoned every remaining item and the user was told only that "bulk action
 * failed" — with no hint that the operation was partial. Here a failing item is
 * recorded and the loop carries on; the toast names how many succeeded, how
 * many failed, and why the first failure failed.
 *
 * Still sequential on purpose: these are Docker daemon mutations, and firing
 * them all at once is a different (and riskier) change.
 */
export async function runBulkAction<T>(
  items: T[],
  perform: (item: T) => Promise<unknown>,
  { verb, noun, context }: { verb: string; noun: string; context?: string },
): Promise<BulkActionOutcome<T>> {
  const succeeded: T[] = [];
  const failed: T[] = [];
  let firstMessage: string | null = null;

  for (const item of items) {
    try {
      await perform(item);
      succeeded.push(item);
    } catch (error) {
      failed.push(item);
      firstMessage ??= error instanceof Error ? error.message : "Docker action failed";
    }
  }

  const suffix = context ? ` for ${context}` : "";

  if (items.length === 0) {
    return { succeeded, failed };
  }

  if (failed.length === 0) {
    toast.success(`${verb} ${pluralize(items.length, noun)}${suffix}`);
  } else {
    toast.error(
      `${verb} ${succeeded.length} of ${pluralize(items.length, noun)}${suffix} · ${failed.length} failed: ${firstMessage}`,
    );
  }

  return { succeeded, failed };
}
