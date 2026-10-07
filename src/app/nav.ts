/**
 * What the screens ask of the page around them — switch tabs, look at a past
 * reconciliation, open the reconciliation form — without importing main.ts,
 * which imports them. main.ts fills these in at start.
 */
import type { Tab } from './prefs';

export const nav = {
  go: (_tab: Tab): void => undefined,
  /** The Accounts tab as it was at a reconciliation; null for the present. */
  snapshot: (_id: string | null): void => undefined,
  snapshotId: (): string | null => null,
  reconcile: (): void => undefined,
  render: (): void => undefined,
  /** A new, empty database in place of this one, then its PIN question; false when it could not be written. */
  anew: (): Promise<boolean> => Promise.resolve(false),
};
