/**
 * Goals: something to buy once personal money allows it.
 *
 *   margin: buy when personal ≥ amount + margin   ("N more than the price is saved")
 *   share:  buy when amount ≤ P % of personal, i.e. personal ≥ amount / (P / 100)
 *
 * In the base currency at the bare rate. Each goal is measured against the
 * same personal money on its own: buying one is not taken out of another.
 */
import { type Forecast, firstReaching } from './forecast';
import type { Goal, State } from './state';
import { convert } from './valuation';

/** How much personal money the goal needs, in the base currency. */
export function threshold(state: State, goal: Goal): number {
  const price = convert(state, goal.amount, goal.currency);
  if (goal.rule.kind === 'margin') return price + convert(state, goal.rule.margin, goal.currency);
  return price / (goal.rule.percent / 100);
}

export interface GoalStatus {
  threshold: number;
  /** Personal money expected now. */
  have: number;
  /** 0 … 100. */
  progress: number;
  lacking: number;
  /** 'now', the first moment the forecast reaches the threshold, or null: not within the horizon. */
  when: 'now' | number | null;
}

export function goalStatus(state: State, goal: Goal, f: Forecast | null, have = f?.current.personal ?? 0): GoalStatus {
  const need = threshold(state, goal);
  const progress = need > 0 ? Math.min(100, Math.max(0, (have / need) * 100)) : 100;
  let when: GoalStatus['when'] = null;
  if (have >= need) when = 'now';
  else if (f) when = firstReaching(f, need);
  return { threshold: need, have, progress, lacking: Math.max(0, need - have), when };
}

/** The goals still open, in the person's order; the reached ones apart, latest first. */
export function sortedGoals(state: State): { open: Goal[]; done: Goal[] } {
  const open = state.goals.filter((g) => g.doneAt === undefined).sort((a, b) => a.order - b.order);
  const done = state.goals.filter((g) => g.doneAt !== undefined).sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0));
  return { open, done };
}
