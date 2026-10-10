/**
 * The Accounts tab, the main one: the accounts and debts by currency, the
 * personal money, the reconciliation button, the short report, the forecast
 * chart and the history of reconciliations.
 *
 * The same tab shows a past reconciliation: its balances, rates and fees as
 * they were, read only — what it expected and what it found, and what was
 * recorded in the interval before it.
 */
import { t, tn } from '../core/i18n';
import { type Forecast, forecast, reconciledNow } from '../core/forecast';
import {
  differences, expect, expectedBalance, inCurrentBase, lastReconciliation, plannedSince, snapshotTotals, unaccounted, unaccountedRate,
} from '../core/reconcile';
import { DAY, perMonth } from '../core/schedule';
import {
  type Account, type Kind, type Reconciliation, type State, activeAccounts, changeBase, decimalsOf, defaultDecimals, emptyState, usedCurrencies,
} from '../core/state';
import { type CurrencyGroup, valuate } from '../core/valuation';
import { openAccount } from './account-dialog';
import { renderChart } from './chart';
import { h, icon } from './dom';
import { ago, date, dateTime, inBase, inCurrency, money, shortDate } from './format';
import { nav } from './nav';
import { prefs, savePrefs } from './prefs';
import { openRecurring } from './recurring';
import { change, getState } from './store';
import { confirmDialog, field, select, toast } from './ui';

/** Days in an average month: an interval's sum over its days, times this, is its pace a month. */
const MONTH = perMonth('day');

/** A sum with its sign and colour: green above zero, red below. */
export function signedAmount(text: string, value: number): HTMLElement {
  return h('span', { class: `amount${tone(value)}` }, text);
}

/** Green for money, red for owing: a debt above zero is owed, below zero overpaid. */
function tone(value: number, kind: Kind = 'asset'): string {
  const own = kind === 'debt' ? -value : value;
  return own > 0.004 ? ' positive' : own < -0.004 ? ' negative' : '';
}

/** Unaccounted money, either way, in orange: it is the thing to look into. */
export function unaccountedAmount(text: string, value: number): HTMLElement {
  return h('span', { class: Math.abs(value) > 0.004 ? 'amount attention' : 'amount' }, text);
}

interface GroupView {
  state: State;
  group: CurrencyGroup;
  /** Rows open the account; not in a past reconciliation. */
  editable: boolean;
  base: string;
  baseDecimals: number;
}

function groupBlock({ state, group, editable, base, baseDecimals }: GroupView): HTMLElement {
  const key = `${group.kind}:${group.currency}`;
  const collapsed = prefs.collapsed.includes(key);
  const rows = h('ul', { class: 'account-rows', hidden: collapsed },
    ...group.lines.map(({ account, balance, value }) => {
      const content = [
        h('span', { class: 'account-name' }, account.name, account.fee ? h('small', { class: 'fee' }, t('accounts', 'fee {fee} %', { fee: account.fee })) : null),
        h('span', { class: `account-balance${tone(balance, account.kind)}` }, money(state, balance, account.currency)),
        group.currency === base ? null : h('span', { class: 'account-value muted' }, inCurrency(value, base, baseDecimals)),
      ];
      return h('li', null, editable
        ? h('button', { type: 'button', class: 'account-row', key: `account-${account.id}`, on: { click: () => openAccount(account) } }, ...content)
        : h('div', { class: 'account-row' }, ...content));
    }));
  const toggle = (): void => {
    const next = prefs.collapsed.includes(key) ? prefs.collapsed.filter((k) => k !== key) : [...prefs.collapsed, key];
    savePrefs({ collapsed: next });
    rows.hidden = next.includes(key);
    head.setAttribute('aria-expanded', String(!rows.hidden));
  };
  const head = h('button', { type: 'button', class: 'group-head', 'aria-expanded': String(!collapsed), key: `group-${key}`, on: { click: toggle } },
    icon('chevron'),
    h('span', { class: 'group-code' }, group.currency),
    h('span', { class: `group-total${tone(group.total, group.kind)}` }, money(state, group.total, group.currency)),
    group.currency === base ? null : h('span', { class: 'group-value muted' }, inCurrency(group.value, base, baseDecimals)));
  return h('div', { class: 'group' }, head, rows);
}

function kindBlock(view: Omit<GroupView, 'group'>, groups: CurrencyGroup[], kind: Kind, total: number, adding: boolean): HTMLElement {
  const own = groups.filter((g) => g.kind === kind);
  const title = kind === 'asset' ? t('accounts', 'Accounts') : t('accounts', 'Debts');
  const totalLabel = kind === 'asset' ? t('accounts', 'Money on accounts') : t('accounts', 'Owed in total');
  return h('section', { class: 'card' },
    h('div', { class: 'card-head' },
      h('h2', { class: 'card-title' }, title),
      adding
        ? h('button', { type: 'button', class: 'button button--small', key: `add-${kind}`, on: { click: () => openAccount(null, kind) } }, icon('plus'), kind === 'asset' ? t('accounts', 'Account') : t('accounts', 'Debt'))
        : null),
    own.length
      ? h('div', { class: 'groups' }, ...own.map((group) => groupBlock({ ...view, group })))
      : h('p', { class: 'muted empty-line' }, kind === 'asset' ? t('accounts', 'No accounts yet.') : t('accounts', 'No debts.')),
    own.length ? h('div', { class: 'card-total' }, h('span', null, totalLabel), h('strong', { class: tone(total, kind).trim() }, inCurrency(total, view.base, view.baseDecimals))) : null);
}

function summary(personal: number, base: string, baseDecimals: number, caption: string): HTMLElement {
  return h('section', { class: 'card summary' },
    h('span', { class: 'summary-label' }, caption),
    h('strong', { class: `summary-value${tone(personal)}`, 'data-test': 'personal' }, inCurrency(personal, base, baseDecimals)),
    h('span', { class: 'muted summary-note' }, t('accounts', 'Money on accounts minus debts')));
}

/* ------------------------------------------------------------------ *
 * The report under the summary.
 * ------------------------------------------------------------------ */

function lastsUntil(state: State, f: Forecast): HTMLElement[] {
  const out: HTMLElement[] = [];
  const line = (text: string, cls = ''): HTMLElement => h('p', { class: `report-line ${cls}`.trim(), 'data-test': 'lasts' }, text);
  if (f.assetsZero !== null) {
    out.push(f.assetsZero <= f.now
      ? line(t('report', 'The money on the accounts has run out.'), 'negative')
      : line(t('report', 'Money lasts until {date}', { date: date(f.assetsZero) }), 'strong'));
  }
  if (f.personalZero !== null && (f.assetsZero === null || f.personalZero < f.assetsZero)) {
    out.push(f.personalZero <= f.now
      ? line(t('report', 'Personal money is below zero: the debts are larger than the money.'), 'negative')
      : line(t('report', 'Personal money goes below zero on {date}', { date: date(f.personalZero) })));
  }
  if (f.assetsZero === null) {
    if (f.perMonth >= 0) out.push(line(t('report', 'Finances are growing: {amount} a month', { amount: inBase(state, f.perMonth, { sign: true, whole: true }) }), 'positive strong'));
    else out.push(line(tn('report', 'Lasts more than {count} year', 'Lasts more than {count} years', state.forecast.horizonYears), 'strong'));
  }
  return out;
}

/**
 * The average pace of unaccounted money, as advice: the forecast does not
 * count on it, since a loss may not happen again. Spending that does repeat
 * becomes a recurring expense at the same pace, and the forecast plans for it;
 * from then on the pace is what goes beyond it.
 */
function unaccountedAdvice(state: State, now: number): HTMLElement | null {
  const planned = plannedSince(state, now);
  const rate = unaccountedRate(state, now, planned);
  if (rate.intervals === 0) {
    return planned !== undefined && state.reconciliations.length >= 2
      ? h('p', { class: 'report-note muted', 'data-test': 'pace' }, t('report', 'Spending outside the accounts is planned as a recurring expense: the next reconciliation shows what goes unaccounted beyond it.'))
      : null;
  }
  const day = inBase(state, rate.perDay, { sign: true });
  if (rate.perDay > 0) return h('p', { class: 'report-note muted', 'data-test': 'pace' }, t('report', 'Unaccounted income, {amount} a day, is not counted on in the forecast.', { amount: day }));
  const daily = Math.round(-rate.perDay * 10 ** decimalsOf(state, state.base));
  if (daily === 0) return null;
  const month = inBase(state, rate.perDay * MONTH, { sign: true, whole: true });
  return h('div', { class: 'advice', 'data-test': 'pace' },
    h('p', null, tn('report', 'Unaccounted on average: {day} a day, {month} a month ({count} interval).', 'Unaccounted on average: {day} a day, {month} a month ({count} intervals).', rate.intervals, { day, month })),
    h('p', { class: 'report-note muted' }, t('report', 'The forecast does not count on it: it may have been a one-off. If it repeats, add it as a recurring expense and the forecast will plan for it.')),
    h('button', {
      type: 'button', class: 'button button--small', key: 'add-unaccounted',
      on: { click: () => openRecurring(null, { name: t('report', 'Unaccounted spending'), every: 'day', type: 'expense', amount: daily, currency: state.base }) },
    }, icon('plus'), t('report', 'Add as a recurring expense')));
}

function report(state: State, f: Forecast | null, now: number): HTMLElement {
  const recs = state.reconciliations;
  const lines: HTMLElement[] = [];
  const last = lastReconciliation(state);

  if (last && now - last.at > state.forecast.remindDays * DAY) {
    lines.push(h('p', { class: 'reminder', 'data-test': 'reminder' },
      t('report', 'Time to reconcile: the last one was {ago}.', { ago: ago(last.at, now) }),
      ' ', h('button', { type: 'button', class: 'link-button', on: { click: () => nav.reconcile() } }, t('report', 'Reconcile now'))));
  }

  if (recs.length >= 2) {
    const rec = recs.at(-1)!;
    const prev = recs.at(-2)!;
    const own = unaccounted(rec);
    const value = inCurrentBase(state, rec, own);
    const days = (rec.at - prev.at) / DAY;
    const shown = (v: number): string => (value === null ? inCurrency(v, rec.base, rec.decimals[rec.base] ?? 2, { sign: true }) : inBase(state, v, { sign: true }));
    const amount = value ?? own;
    lines.push(h('div', { class: 'report-row' },
      h('span', null, t('report', 'Unaccounted, {from} – {to}', { from: shortDate(prev.at), to: shortDate(rec.at) })),
      h('span', { 'data-test': 'unaccounted' }, unaccountedAmount(shown(amount), amount),
        days > 0 ? h('small', { class: 'muted' }, ' ', t('report', '{amount} a month', { amount: shown((amount / days) * MONTH) })) : null)));
  } else {
    lines.push(h('div', { class: 'report-row muted' }, h('span', null, t('report', 'Unaccounted money shows after the second reconciliation.'))));
  }

  if (f) {
    const atLast = reconciledNow(state) ?? 0;
    const diff = f.current.personal - atLast;
    lines.push(h('div', { class: 'report-row' },
      h('span', null, t('report', 'Expected now')),
      h('span', { 'data-test': 'expected-now' }, h('strong', null, inBase(state, f.current.personal)), ' ',
        h('small', { class: 'muted' }, t('report', '{diff} since the reconciliation', { diff: inBase(state, diff, { sign: true }) })))));
    const advice = unaccountedAdvice(state, now);
    if (advice) lines.push(advice);
    lines.push(h('div', { class: 'lasts' }, ...lastsUntil(state, f)));
  }
  return h('section', { class: 'card report' }, h('h2', { class: 'card-title' }, t('report', 'Report')), ...lines);
}

function history(state: State): HTMLElement | null {
  if (state.reconciliations.length === 0) return null;
  const list = [...state.reconciliations].reverse();
  return h('section', { class: 'card' },
    h('h2', { class: 'card-title' }, t('history', 'Reconciliations')),
    h('ul', { class: 'history' }, ...list.map((rec, index) => {
      const totals = snapshotTotals(rec);
      const personal = inCurrentBase(state, rec, totals.personal);
      const own = unaccounted(rec);
      const u = inCurrentBase(state, rec, own);
      const isFirst = index === list.length - 1;
      const decimals = rec.decimals[rec.base] ?? 2;
      return h('li', null, h('button', { type: 'button', class: 'history-row', key: `rec-${rec.id}`, on: { click: () => nav.snapshot(rec.id) } },
        h('span', { class: 'history-date' }, dateTime(rec.at)),
        h('span', { class: 'history-personal' }, personal === null ? inCurrency(totals.personal, rec.base, decimals) : inBase(state, personal)),
        h('span', { class: 'history-unaccounted' }, isFirst ? h('span', { class: 'muted' }, t('history', 'first')) : unaccountedAmount(u === null ? inCurrency(own, rec.base, decimals, { sign: true }) : inBase(state, u, { sign: true }), own)),
        icon('chevron')));
    })));
}

/* ------------------------------------------------------------------ *
 * The first start.
 * ------------------------------------------------------------------ */

function welcome(state: State): HTMLElement {
  const base = select(state.currencies.map((c) => [c.code, c.code] as [string, string]).concat(
    ['USD', 'EUR', 'UAH', 'GBP', 'PLN', 'CHF', 'JPY', 'CNY', 'INR', 'BRL', 'TRY', 'CAD', 'AUD', 'KZT', 'GEL', 'CZK']
      .filter((c) => !state.currencies.some((x) => x.code === c)).map((c) => [c, c] as [string, string]),
  ), state.base, (code) => {
    change((s) => {
      const before = s.base;
      if (!s.currencies.some((c) => c.code === code)) s.currencies.push({ code, rate: 1, decimals: defaultDecimals(code), updatedAt: Date.now() });
      Object.assign(s, changeBase(s, code));
      // The guessed base had no real rate to the new one: unused, it goes, and can come back with a rate.
      if (!usedCurrencies(s).has(before)) s.currencies = s.currencies.filter((c) => c.code !== before);
    });
  }, { key: 'welcome-base', 'aria-label': t('welcome', 'Base currency') });
  return h('section', { class: 'card welcome' },
    h('h1', null, t('welcome', 'Choose the base currency and add the first account')),
    h('p', { class: 'muted' }, t('welcome', 'No need to record every expense. Add your accounts, debts and regular payments once; now and then type in the real balances. The app works out the rest: how much went unrecorded, how long the money lasts, when you can buy what you want.')),
    field(t('welcome', 'Base currency: all totals are shown in it'), base),
    h('div', { class: 'buttons' },
      h('button', { type: 'button', class: 'button button--primary', key: 'welcome-add', on: { click: () => openAccount(null, 'asset') } }, icon('plus'), t('welcome', 'Add the first account'))));
}

/* ------------------------------------------------------------------ *
 * The tab.
 * ------------------------------------------------------------------ */

function displayBalances(state: State, now: number): Map<string, number> {
  const expectation = expect(state, now);
  const out = new Map<string, number>();
  for (const account of state.accounts) out.set(account.id, expectedBalance(expectation, account));
  return out;
}

function reconcileButton(state: State): HTMLElement {
  const last = lastReconciliation(state);
  return h('div', { class: 'reconcile-bar' },
    h('button', { type: 'button', class: 'button button--primary button--large', key: 'reconcile', on: { click: () => nav.reconcile() } },
      icon('scale'), t('accounts', 'Reconcile'), h('kbd', { class: 'kbd' }, 'R')),
    h('span', { class: 'muted' }, last
      ? t('accounts', 'Last: {date}', { date: dateTime(last.at) })
      : t('accounts', 'Type in the real balances once to start the forecast.')));
}

export function renderAccounts(view: HTMLElement, now: number): void {
  const state = getState();
  const id = nav.snapshotId();
  const rec = id ? state.reconciliations.find((r) => r.id === id) : undefined;
  if (rec) {
    renderSnapshot(view, state, rec);
    return;
  }
  if (state.accounts.length === 0) {
    view.append(welcome(state));
    return;
  }
  const accounts = activeAccounts(state);
  const valuation = valuate(state, accounts, displayBalances(state, now));
  const f = forecast(state, now);
  const baseDecimals = state.currencies.find((c) => c.code === state.base)?.decimals ?? 2;
  const groupView = { state, editable: true, base: state.base, baseDecimals };
  view.append(
    h('div', { class: 'columns' },
      h('div', { class: 'column' },
        kindBlock(groupView, valuation.groups, 'asset', valuation.assets, true),
        kindBlock(groupView, valuation.groups, 'debt', valuation.debts, true)),
      h('div', { class: 'column' },
        summary(f?.current.personal ?? valuation.personal, state.base, baseDecimals, f ? t('accounts', 'Personal money, expected now') : t('accounts', 'Personal money')),
        reconcileButton(state),
        report(state, f, now))),
    f
      ? renderChart(state, f, prefs.period)
      : h('section', { class: 'card chart-empty' }, h('p', { class: 'muted' }, t('chart', 'Make the first reconciliation: the forecast starts from it.'))),
    history(state) ?? '',
  );
}

/* ------------------------------------------------------------------ *
 * A past reconciliation.
 * ------------------------------------------------------------------ */

/** A state that holds only what the snapshot knew: its base, rates and decimals, its accounts. */
function snapshotState(rec: Reconciliation): { state: State; accounts: Account[]; balances: Map<string, number> } {
  const state = emptyState(rec.base);
  state.currencies = Object.entries(rec.rates).map(([code, rate]) => ({ code, rate, decimals: rec.decimals[code] ?? 2, updatedAt: rec.at }));
  const accounts = rec.accounts.map((a, order) => ({ id: a.id, name: a.name, kind: a.kind, currency: a.currency, fee: a.fee, opening: a.balance, createdAt: rec.at, order }));
  state.accounts = accounts;
  return { state, accounts, balances: new Map(rec.accounts.map((a) => [a.id, a.balance])) };
}

async function removeLast(state: State, rec: Reconciliation): Promise<void> {
  const ok = await confirmDialog(
    t('snapshot', 'Delete this reconciliation?'),
    t('snapshot', 'The reconciliation of {date} is removed, as if it had not been made. The one before it becomes the last.', { date: dateTime(rec.at) }),
    t('snapshot', 'Delete'),
    true,
  );
  if (!ok || lastReconciliation(getState())?.id !== rec.id) return;
  change((s) => void (s.reconciliations = s.reconciliations.filter((r) => r.id !== rec.id)));
  nav.snapshot(null);
  toast(t('snapshot', 'Reconciliation deleted'));
}

/** The interval's movements by operation and currency: a daily payment is one line, not thirty. */
function groupOccurrences(rec: Reconciliation): Array<{ name: string; currency: string; count: number; sum: number; first: number; last: number }> {
  const groups = new Map<string, { name: string; currency: string; count: number; sum: number; first: number; last: number }>();
  for (const o of rec.occurrences) {
    const key = `${o.opId}|${o.currency}|${Math.sign(o.amount)}`;
    const g = groups.get(key) ?? { name: o.name, currency: o.currency, count: 0, sum: 0, first: o.at, last: o.at };
    g.count += 1;
    g.sum += o.amount;
    g.first = Math.min(g.first, o.at);
    g.last = Math.max(g.last, o.at);
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => b.last - a.last);
}

function renderSnapshot(view: HTMLElement, current: State, rec: Reconciliation): void {
  const { state, accounts, balances } = snapshotState(rec);
  const valuation = valuate(state, accounts, balances);
  const baseDecimals = rec.decimals[rec.base] ?? 2;
  const index = current.reconciliations.findIndex((r) => r.id === rec.id);
  const isLast = index === current.reconciliations.length - 1;
  const prev = index > 0 ? current.reconciliations[index - 1] : undefined;
  const groupView = { state, editable: false, base: rec.base, baseDecimals };
  const diffs = differences(rec);
  const codes = Object.keys(diffs).sort((a, b) => (a === rec.base ? -1 : b === rec.base ? 1 : a.localeCompare(b)));
  const own = unaccounted(rec);

  view.append(
    h('div', { class: 'snapshot-bar', role: 'status' },
      h('span', null, t('snapshot', 'Reconciliation of {date}', { date: dateTime(rec.at) })),
      h('span', { class: 'snapshot-actions' },
        isLast ? h('button', { type: 'button', class: 'button button--small button--danger', key: 'snapshot-delete', on: { click: () => void removeLast(current, rec) } }, icon('trash'), t('snapshot', 'Delete')) : null,
        h('button', { type: 'button', class: 'button button--small', key: 'snapshot-back', on: { click: () => nav.snapshot(null) } }, icon('back'), t('snapshot', 'Back to now')))),
    h('div', { class: 'columns' },
      h('div', { class: 'column' },
        kindBlock(groupView, valuation.groups, 'asset', valuation.assets, false),
        kindBlock(groupView, valuation.groups, 'debt', valuation.debts, false)),
      h('div', { class: 'column' },
        summary(valuation.personal, rec.base, baseDecimals, t('snapshot', 'Personal money then')),
        h('section', { class: 'card report' },
          h('h2', { class: 'card-title' }, t('snapshot', 'Expected and found')),
          prev
            ? h('div', { class: 'report-row' },
                h('span', null, t('report', 'Unaccounted, {from} – {to}', { from: shortDate(prev.at), to: shortDate(rec.at) })),
                h('span', { 'data-test': 'snapshot-unaccounted' }, unaccountedAmount(inCurrency(own, rec.base, baseDecimals, { sign: true }), own)))
            : h('p', { class: 'muted' }, t('snapshot', 'The first reconciliation: there was nothing to compare it with.')),
          h('div', { class: 'table-wrap' }, h('table', { class: 'table compare' },
            h('thead', null, h('tr', null,
              h('th', { scope: 'col' }, t('snapshot', 'Currency')),
              h('th', { scope: 'col' }, t('snapshot', 'Expected')),
              h('th', { scope: 'col' }, t('snapshot', 'Found')),
              h('th', { scope: 'col' }, t('snapshot', 'Difference')))),
            h('tbody', null, ...codes.map((code) => {
              const d = rec.decimals[code] ?? 2;
              const diff = diffs[code] ?? 0;
              return h('tr', null,
                h('th', { scope: 'row' }, code),
                h('td', null, inCurrency((rec.expected[code] ?? 0) / 10 ** d, code, d)),
                h('td', null, inCurrency((rec.actual[code] ?? 0) / 10 ** d, code, d)),
                h('td', null, unaccountedAmount(inCurrency(diff / 10 ** d, code, d, { sign: true }), diff)));
            }))))))),
    h('section', { class: 'card' },
      h('h2', { class: 'card-title' }, t('snapshot', 'Recorded in the interval')),
      rec.occurrences.length
        ? h('ul', { class: 'op-list' }, ...groupOccurrences(rec).map((g) => {
            const d = rec.decimals[g.currency] ?? 2;
            return h('li', { class: 'op-row' },
              h('span', { class: 'op-main' },
                h('span', { class: 'op-name' }, g.name || '—'),
                h('span', { class: 'op-meta muted' }, g.count > 1
                  ? tn('snapshot', '{count} time, {from} – {to}', '{count} times, {from} – {to}', g.count, { from: shortDate(g.first), to: shortDate(g.last) })
                  : dateTime(g.first))),
              h('span', { class: 'op-amount' }, signedAmount(inCurrency(g.sum / 10 ** d, g.currency, d, { sign: true }), g.sum)));
          }))
        : h('p', { class: 'muted' }, prev ? t('snapshot', 'Nothing was recorded in the interval.') : t('snapshot', 'Nothing before the first reconciliation counts.'))),
  );
}

