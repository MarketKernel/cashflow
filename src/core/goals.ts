/**
 * Goals: something to buy once personal money allows it.
 *
 *   margin: buy when personal ≥ amount + margin   ("N more than the price is saved")
 *   share:  buy when amount ≤ P % of personal, i.e. personal ≥ amount / (P / 100)
 *
 * In the base currency at the bare rate. Goals are bought in the person's
 * order, the top one first: each counts on the personal money left after the
 * prices of the ones above it, and cannot come before the one just above.
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
  /** The prices of the goals above it, which are bought first. */
  ahead: number;
  /** Personal money expected now, less what goes to the goals above. */
  have: number;
  /** 0 … 100. */
  progress: number;
  lacking: number;
  /** 'now', the first moment the forecast reaches the threshold, or null: not within the horizon. */
  when: 'now' | number | null;
  /** It could be bought earlier, but the goal above comes first. */
  waiting: boolean;
}

const rank = (when: GoalStatus['when']): number => (when === 'now' ? -Infinity : when ?? Infinity);

/**
 * One goal after others: `ahead` is the money they take first, `after` when
 * the last of them is bought — this goal is not before it.
 */
export function goalStatus(state: State, goal: Goal, f: Forecast | null, ahead = 0, after: GoalStatus['when'] = 'now'): GoalStatus {
  const need = threshold(state, goal);
  const have = (f?.current.personal ?? 0) - ahead;
  const progress = need > 0 ? Math.min(100, Math.max(0, (have / need) * 100)) : 100;
  const own: GoalStatus['when'] = have >= need ? 'now' : f ? firstReaching(f, need + ahead) : null;
  let when: GoalStatus['when'] = null;
  if (after === 'now') when = own;
  else if (after !== null && f) when = firstReaching(f, need + ahead, after);
  return { threshold: need, ahead, have, progress, lacking: Math.max(0, need - have), when, waiting: rank(own) < rank(when) };
}

/** The open goals in order, each bought after the ones above it. */
export function goalPlan(state: State, f: Forecast | null): Array<{ goal: Goal; status: GoalStatus }> {
  let ahead = 0;
  let after: GoalStatus['when'] = 'now';
  return sortedGoals(state).open.map((goal) => {
    const status = goalStatus(state, goal, f, ahead, after);
    ahead += convert(state, goal.amount, goal.currency);
    after = status.when;
    return { goal, status };
  });
}

/** The goals still open, in the person's order; the reached ones apart, latest first. */
export function sortedGoals(state: State): { open: Goal[]; done: Goal[] } {
  const open = state.goals.filter((g) => g.doneAt === undefined).sort((a, b) => a.order - b.order);
  const done = state.goals.filter((g) => g.doneAt !== undefined).sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0));
  return { open, done };
}
