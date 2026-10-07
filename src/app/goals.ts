/**
 * The Goals tab: what to buy, and when the forecast says it can be bought.
 * Each goal is measured on its own against the same personal money; "Bought"
 * records the purchase as a one-off expense and moves the goal to the reached
 * ones, folded at the bottom.
 */
import { t } from '../core/i18n';
import { forecast } from '../core/forecast';
import { goalStatus, sortedGoals } from '../core/goals';
import { formatInput } from '../core/money';
import { type Goal, type GoalRule, type State, accountOf, activeAccounts, decimalsOf, newId } from '../core/state';
import { convert } from '../core/valuation';
import { h, icon } from './dom';
import { date, inBase, localeTag, money } from './format';
import { accountLabel, amountField, currencyOptions } from './inputs';
import { prefs, savePrefs } from './prefs';
import { change, getState } from './store';
import { confirmDialog, dialog, enterMovesOn, field, segmented, select, toast } from './ui';

function ruleText(state: State, goal: Goal): string {
  return goal.rule.kind === 'margin'
    ? t('goals', 'when personal money is {margin} more than the price', { margin: money(state, goal.rule.margin, goal.currency) })
    : t('goals', 'when the price is at most {percent} % of personal money', { percent: goal.rule.percent });
}

function move(goal: Goal, by: -1 | 1): void {
  change((s) => {
    const open = sortedGoals(s).open;
    const i = open.findIndex((g) => g.id === goal.id);
    const other = open[i + by];
    if (i < 0 || !other) return;
    open.forEach((g, index) => (g.order = index));
    const mine = s.goals.find((g) => g.id === goal.id)!;
    const theirs = s.goals.find((g) => g.id === other.id)!;
    [mine.order, theirs.order] = [i + by, i];
  });
}

export function renderGoals(view: HTMLElement, now: number): void {
  const state = getState();
  const f = forecast(state, now);
  const { open, done } = sortedGoals(state);
  const cards = open.map((goal, index) => {
    const status = goalStatus(state, goal, f);
    const when = status.when === 'now'
      ? h('strong', { class: 'positive' }, t('goals', 'Can buy now'))
      : status.when === null
        ? h('span', { class: 'muted' }, f ? t('goals', 'Not within the forecast horizon') : t('goals', 'The forecast starts with the first reconciliation'))
        : h('strong', null, t('goals', 'Can buy on {date}', { date: date(status.when) }));
    return h('article', { class: 'card goal', 'data-test': `goal-${goal.id}` },
      h('div', { class: 'card-head' },
        h('h2', { class: 'card-title' }, goal.name, ' ', h('span', { class: 'goal-price' }, money(state, goal.amount, goal.currency))),
        h('div', { class: 'goal-tools' },
          h('button', { type: 'button', class: 'icon-button', disabled: index === 0, 'aria-label': t('goals', 'Move up'), key: `goal-up-${goal.id}`, on: { click: () => move(goal, -1) } }, icon('up')),
          h('button', { type: 'button', class: 'icon-button', disabled: index === open.length - 1, 'aria-label': t('goals', 'Move down'), key: `goal-down-${goal.id}`, on: { click: () => move(goal, 1) } }, icon('down')),
          h('button', { type: 'button', class: 'icon-button', 'aria-label': t('goals', 'Edit'), key: `goal-edit-${goal.id}`, on: { click: () => openGoal(goal) } }, icon('edit')))),
      h('p', { class: 'muted goal-rule' }, ruleText(state, goal)),
      h('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(status.progress) },
        h('span', { class: 'progress-bar', style: `width: ${status.progress.toFixed(2)}%` })),
      h('dl', { class: 'goal-facts' },
        h('div', null, h('dt', null, t('goals', 'Needed')), h('dd', { 'data-test': 'threshold' }, inBase(state, status.threshold))),
        h('div', null, h('dt', null, t('goals', 'Have now')), h('dd', null, inBase(state, status.have))),
        h('div', null, h('dt', null, t('goals', 'Progress')), h('dd', { 'data-test': 'progress' }, `${new Intl.NumberFormat(localeTag(), { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(status.progress)} %`)),
        h('div', null, h('dt', null, t('goals', 'Lacking')), h('dd', { 'data-test': 'lacking' }, inBase(state, status.lacking)))),
      h('div', { class: 'goal-foot' },
        h('span', { 'data-test': 'when' }, when),
        h('button', { type: 'button', class: 'button button--small', key: `goal-bought-${goal.id}`, on: { click: () => bought(goal) } }, icon('check'), t('goals', 'Bought'))));
  });

  view.append(
    h('div', { class: 'page-head' },
      h('h1', { class: 'page-title' }, t('goals', 'Goals')),
      h('button', { type: 'button', class: 'button button--primary', key: 'add-goal', on: { click: () => openGoal(null) } }, icon('plus'), t('goals', 'Goal'), h('kbd', { class: 'kbd' }, 'N'))),
    open.length
      ? h('p', { class: 'muted' }, t('goals', 'Each goal is measured against the same personal money: buying one is not taken out of another.'))
      : h('section', { class: 'card' }, h('p', { class: 'muted' }, t('goals', 'Something to buy? Add it, with how much should be left over, and the forecast tells you when.'))),
    h('div', { class: 'goals' }, ...cards),
    done.length
      ? h('details', { class: 'card done-goals' },
          h('summary', null, t('goals', 'Reached ({count})', { count: done.length })),
          h('ul', { class: 'op-list' }, ...done.map((goal) => h('li', { class: 'op-row' },
            h('span', { class: 'op-main' }, h('span', { class: 'op-name' }, goal.name), h('span', { class: 'op-meta muted' }, date(goal.doneAt ?? 0))),
            h('span', { class: 'op-amount' }, money(state, goal.amount, goal.currency)),
            h('button', { type: 'button', class: 'icon-button', 'aria-label': t('goals', 'Delete'), on: { click: () => void removeGoal(goal) } }, icon('trash'))))))
      : '',
  );
}

async function removeGoal(goal: Goal): Promise<void> {
  if (!(await confirmDialog(t('goals', 'Delete {name}?', { name: goal.name }), t('goals', 'The goal is removed; an expense recorded for it stays.'), t('goals', 'Delete'), true))) return;
  change((s) => void (s.goals = s.goals.filter((g) => g.id !== goal.id)));
}

export function openGoal(goal: Goal | null): void {
  const state = getState();
  let currency = goal?.currency ?? state.base;
  let kind: GoalRule['kind'] = goal?.rule.kind ?? 'margin';
  const name = h('input', { type: 'text', value: goal?.name ?? '', key: 'goal-name', autocomplete: 'off', placeholder: t('goals', 'Laptop') });
  const amount = amountField({ value: goal ? formatInput(goal.amount, decimalsOf(state, currency)) : '', decimals: () => decimalsOf(getState(), currency), key: 'goal-amount' });
  const margin = amountField({ value: goal?.rule.kind === 'margin' ? formatInput(goal.rule.margin, decimalsOf(state, currency)) : '', decimals: () => decimalsOf(getState(), currency), key: 'goal-margin' });
  const percent = h('input', { type: 'text', inputmode: 'decimal', value: goal?.rule.kind === 'share' ? String(goal.rule.percent) : '50', key: 'goal-percent', class: 'short-input' });
  const marginRow = field(t('goals', 'Left over after buying'), margin.element, t('goals', 'Buy when personal money is at least the price plus this.'));
  const percentRow = field(t('goals', 'At most this share of personal money, %'), percent, t('goals', 'Buy when the price is no more than this part of personal money.'));
  const sync = (): void => {
    marginRow.hidden = kind !== 'margin';
    percentRow.hidden = kind !== 'share';
  };
  sync();

  const save = (): boolean => {
    const title = name.value.trim();
    const price = amount.read();
    if (!title) {
      name.classList.add('invalid');
      name.focus();
      return false;
    }
    if (price === null || price === 0) {
      amount.invalid(true);
      amount.input.focus();
      return false;
    }
    let rule: GoalRule;
    if (kind === 'margin') {
      const m = margin.input.value.trim() === '' ? 0 : margin.read();
      if (m === null) {
        margin.invalid(true);
        return false;
      }
      rule = { kind, margin: m };
    } else {
      const p = Number(percent.value.replace(',', '.'));
      if (!Number.isFinite(p) || p <= 0 || p > 100) {
        percent.classList.add('invalid');
        return false;
      }
      rule = { kind, percent: p };
    }
    change((s) => {
      const existing = s.goals.find((g) => g.id === goal?.id);
      if (existing) Object.assign(existing, { name: title, amount: price, currency, rule });
      else s.goals.push({ id: newId(), name: title, amount: price, currency, rule, order: Math.max(-1, ...s.goals.map((g) => g.order)) + 1 });
    });
    return true;
  };

  const { element } = dialog(goal ? goal.name : t('goals', 'New goal'), [
    field(t('goals', 'What'), name),
    h('div', { class: 'grid-2' },
      field(t('goals', 'Price'), amount.element),
      field(t('goals', 'Currency'), select(currencyOptions(state), currency, (c) => void (currency = c), { key: 'goal-currency' }))),
    segmented<GoalRule['kind']>([['margin', t('goals', 'With money to spare')], ['share', t('goals', 'As a share')]], kind, (k) => {
      kind = k;
      sync();
    }, t('goals', 'When to buy'), 'goal-rule'),
    marginRow,
    percentRow,
  ], [
    ...(goal ? [{ label: t('goals', 'Delete'), kind: 'danger' as const, run: () => void removeGoal(goal) }] : []),
    { label: t('dialog', 'Cancel') },
    { label: goal ? t('dialog', 'Save') : t('goals', 'Add'), kind: 'primary', key: 'goal-save', run: save },
  ]);
  enterMovesOn([name, amount.input, kind === 'margin' ? margin.input : percent], () => element.querySelector<HTMLButtonElement>('[data-key="goal-save"]')?.click());
  name.focus();
}

/** Records the purchase as an expense today from an account of choice, and puts the goal among the reached. */
function bought(goal: Goal): void {
  const state = getState();
  const accounts = activeAccounts(state).filter((a) => a.kind === 'asset');
  let accountId = accounts.find((a) => a.id === prefs.lastAccount)?.id ?? accounts.find((a) => a.currency === goal.currency)?.id ?? accounts[0]?.id ?? '';
  const account = () => accountOf(getState(), accountId);
  const suggest = (): string => {
    const a = account();
    const s = getState();
    if (!a || a.currency === goal.currency) return formatInput(goal.amount, decimalsOf(s, goal.currency));
    // In the account's currency at today's rates; the person corrects it to what was paid.
    const value = convert(s, goal.amount, goal.currency) / (convert(s, 10 ** decimalsOf(s, a.currency), a.currency) || 1);
    return formatInput(Math.round(value * 10 ** decimalsOf(s, a.currency)), decimalsOf(s, a.currency));
  };
  const amount = amountField({ value: suggest(), decimals: () => decimalsOf(getState(), account()?.currency ?? goal.currency), key: 'bought-amount' });
  const unit = h('span', { class: 'amount-unit muted' }, account()?.currency ?? goal.currency);
  const picker = select<string>([['', t('goals', 'No account')], ...accounts.map((a) => [a.id, accountLabel(a)] as [string, string])], accountId, (id) => {
    accountId = id;
    amount.input.value = suggest();
    unit.textContent = account()?.currency ?? goal.currency;
  }, { key: 'bought-account' });
  dialog(t('goals', 'Bought: {name}', { name: goal.name }), [
    h('p', { class: 'muted' }, t('goals', 'The purchase is recorded as an expense today, and the goal moves to the reached ones.')),
    h('div', { class: 'grid-2' },
      field(t('goals', 'Paid'), h('span', { class: 'with-unit' }, amount.element, unit)),
      field(t('goals', 'From'), picker)),
  ], [
    { label: t('dialog', 'Cancel') },
    {
      label: t('goals', 'Record the expense'), kind: 'primary', key: 'bought-confirm',
      run: () => {
        const paid = amount.read();
        if (paid === null || paid === 0) {
          amount.invalid(true);
          return false;
        }
        const now = Date.now();
        const a = account();
        change((s) => {
          s.oneOff.push({ id: newId(), type: 'expense', at: now, amount: paid, currency: a?.currency ?? goal.currency, ...(a ? { accountId: a.id } : {}), note: goal.name });
          const g = s.goals.find((x) => x.id === goal.id);
          if (g) g.doneAt = now;
        });
        if (a) savePrefs({ lastAccount: a.id });
        toast(t('goals', '{name}: bought', { name: goal.name }));
        return true;
      },
    },
  ]);
}
