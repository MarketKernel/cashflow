/**
 * The forecast chart, SVG by hand: personal money (the main line) and the
 * money on the accounts, from now to now + the chosen period, with the zero
 * line and the thresholds of the open goals.
 *
 * Money changes in steps — a payment happens at a moment — so the lines are
 * drawn as steps, one at every sample the forecast took. A crosshair follows
 * the pointer (or the arrow keys) and a tooltip gives the date and both
 * values; the same numbers are in a table under the chart.
 *
 * Colours come from CSS variables (--series-1, --series-2, …), validated for
 * colour-blind separation and contrast in both themes; text never wears them.
 */
import { t } from '../core/i18n';
import { type Forecast, type Sample, samplesBetween } from '../core/forecast';
import { threshold } from '../core/goals';
import type { State } from '../core/state';
import { fill, h, s } from './dom';
import { date, inBase, localeTag, shortDate } from './format';
import { type Period, savePrefs } from './prefs';
import { nav } from './nav';
import { segmented } from './ui';

export function periodEnd(now: number, period: Period): number {
  const d = new Date(now);
  if (period === 'week') return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7, d.getHours(), d.getMinutes()).getTime();
  const months = { month: 1, quarter: 3, half: 6, year: 12 }[period];
  d.setMonth(d.getMonth() + months);
  return d.getTime();
}

/** Round tick values covering [low, high]: 1, 2 or 5 times a power of ten apart. */
function ticks(low: number, high: number, count = 5): number[] {
  const span = high - low || Math.abs(high) || 1;
  const raw = span / count;
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((m) => m >= raw) ?? power * 10;
  const out: number[] = [];
  for (let v = Math.floor(low / step) * step; v <= high + step * 0.001; v += step) out.push(Math.round(v / step) * step);
  return out;
}

const compact = (value: number): string =>
  new Intl.NumberFormat(localeTag(), { notation: 'compact', maximumFractionDigits: 1 }).format(value);

interface Line {
  label: string;
  key: 'personal' | 'assets';
  cls: string;
}

export function renderChart(state: State, f: Forecast, period: Period): HTMLElement {
  const end = periodEnd(f.now, period);
  const samples = samplesBetween(f, f.now, end);
  const lines: Line[] = [
    { label: t('chart', 'Personal money'), key: 'personal', cls: 'series-1' },
    { label: t('chart', 'Money on accounts'), key: 'assets', cls: 'series-2' },
  ];
  const goals = state.goals.filter((g) => g.doneAt === undefined).map((g) => ({ name: g.name, value: threshold(state, g) }));

  // Time runs left to right in every language.
  const plot = h('div', { class: 'chart-plot', dir: 'ltr' });
  const tooltip = h('div', { class: 'chart-tooltip', hidden: true, role: 'status' });
  const legend = h('ul', { class: 'chart-legend' },
    ...lines.map((line) => h('li', null, h('span', { class: `line-key ${line.cls}` }), line.label)),
    goals.length ? h('li', null, h('span', { class: 'line-key goal-key' }), t('chart', 'Goals')) : null);

  const draw = (width: number): void => {
    const height = Math.max(220, Math.min(320, width * 0.42));
    // The right margin holds the values at the end of the lines.
    const pad = { top: 16, right: 58, bottom: 28, left: 56 };
    const w = width - pad.left - pad.right;
    const ht = height - pad.top - pad.bottom;
    const values = samples.flatMap((p) => [p.personal, p.assets]);
    let low = Math.min(0, ...values);
    let high = Math.max(0, ...values);
    // Goal thresholds near the data are worth showing; one far above would flatten the lines.
    const shown = goals.filter((g) => g.value <= high * 1.5 + 1);
    high = Math.max(high, ...shown.map((g) => g.value));
    if (high === low) high = low + 1;
    const yTicks = ticks(low, high);
    low = Math.min(low, yTicks[0]!);
    high = Math.max(high, yTicks.at(-1)!);
    const x = (at: number): number => pad.left + ((at - f.now) / (end - f.now)) * w;
    const y = (v: number): number => pad.top + (1 - (v - low) / (high - low)) * ht;

    const svg = s('svg', { viewBox: `0 0 ${width} ${height}`, width, height, class: 'chart-svg', role: 'img', 'aria-label': t('chart', 'Forecast of personal money and money on accounts') });
    for (const v of yTicks) {
      svg.append(s('line', { x1: pad.left, x2: width - pad.right, y1: y(v), y2: y(v), class: v === 0 ? 'chart-zero' : 'chart-grid' }));
      svg.append(s('text', { x: pad.left - 8, y: y(v), class: 'chart-tick', 'text-anchor': 'end', 'dominant-baseline': 'middle' }, compact(v)));
    }
    const xCount = Math.max(2, Math.min(6, Math.floor(w / 110)));
    for (let i = 0; i <= xCount; i += 1) {
      const at = f.now + ((end - f.now) * i) / xCount;
      svg.append(s('text', { x: x(at), y: height - 8, class: 'chart-tick', 'text-anchor': i === 0 ? 'start' : i === xCount ? 'end' : 'middle' }, i === 0 ? t('chart', 'now') : shortDate(at)));
    }
    for (const goal of shown) {
      svg.append(s('line', { x1: pad.left, x2: width - pad.right, y1: y(goal.value), y2: y(goal.value), class: 'chart-goal' }));
      svg.append(s('text', { x: pad.left + 4, y: y(goal.value) - 5, class: 'chart-goal-label', 'text-anchor': 'start' }, goal.name));
    }
    // Steps: the value holds until the next sample.
    for (const line of [...lines].reverse()) {
      let d = '';
      samples.forEach((p, i) => {
        const px = x(p.at).toFixed(1);
        const py = y(p[line.key]).toFixed(1);
        d += i === 0 ? `M${px},${py}` : `H${px}V${py}`;
      });
      svg.append(s('path', { d, class: `chart-line ${line.cls}` }));
    }
    // The values at the end, left of the lines' last points, kept at least a line apart.
    const last = samples.at(-1);
    if (last) {
      const marks = lines.map((line) => ({ line, y: y(last[line.key]) })).sort((a, b) => a.y - b.y);
      const labelY = marks.map((m) => m.y + 4);
      if (labelY[1]! - labelY[0]! < 15) {
        const middle = (labelY[0]! + labelY[1]!) / 2;
        labelY[0] = middle - 7.5;
        labelY[1] = middle + 7.5;
      }
      marks.forEach((m, i) => {
        svg.append(s('circle', { cx: x(last.at), cy: m.y, r: 4, class: `chart-dot ${m.line.cls}` }));
        svg.append(s('text', { x: x(last.at) + 8, y: labelY[i]!, class: 'chart-end-label', 'text-anchor': 'start' }, compact(last[m.line.key])));
      });
    }

    const hair = s('line', { y1: pad.top, y2: pad.top + ht, class: 'chart-hair', visibility: 'hidden' });
    const dots = lines.map((line) => s('circle', { r: 4, class: `chart-dot ${line.cls}`, visibility: 'hidden' }));
    svg.append(hair, ...dots);

    let index = 0;
    const show = (i: number): void => {
      index = Math.max(0, Math.min(samples.length - 1, i));
      const p = samples[index];
      if (!p) return;
      const px = x(p.at);
      hair.setAttribute('x1', String(px));
      hair.setAttribute('x2', String(px));
      hair.setAttribute('visibility', 'visible');
      dots.forEach((dot, k) => {
        dot.setAttribute('cx', String(px));
        dot.setAttribute('cy', String(y(p[lines[k]!.key])));
        dot.setAttribute('visibility', 'visible');
      });
      fill(tooltip,
        h('div', { class: 'tooltip-date' }, date(p.at)),
        ...lines.map((line) => h('div', { class: 'tooltip-row' }, h('span', { class: `line-key ${line.cls}` }), h('strong', null, inBase(state, p[line.key], { whole: true })), h('span', { class: 'muted' }, line.label))));
      tooltip.hidden = false;
      const left = Math.min(Math.max(0, px - 95), width - 190);
      tooltip.style.insetInlineStart = '';
      tooltip.style.left = `${left}px`;
    };
    const hide = (): void => {
      hair.setAttribute('visibility', 'hidden');
      for (const dot of dots) dot.setAttribute('visibility', 'hidden');
      tooltip.hidden = true;
    };
    const nearest = (clientX: number): number => {
      const box = svg.getBoundingClientRect();
      const at = f.now + ((clientX - box.left - pad.left) / w) * (end - f.now);
      let best = 0;
      for (let i = 1; i < samples.length; i += 1) if (Math.abs(samples[i]!.at - at) < Math.abs(samples[best]!.at - at)) best = i;
      return best;
    };
    svg.addEventListener('pointermove', (e) => show(nearest(e.clientX)));
    svg.addEventListener('pointerdown', (e) => show(nearest(e.clientX)));
    svg.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse') hide();
    });
    plot.onkeydown = (e) => {
      const step = e.shiftKey ? 7 : 1;
      if (e.key === 'ArrowRight') show(index + step);
      else if (e.key === 'ArrowLeft') show(index - step);
      else if (e.key === 'Escape') hide();
      else return;
      e.preventDefault();
    };
    plot.onblur = hide;
    fill(plot, svg, tooltip);
  };

  plot.tabIndex = 0;
  plot.setAttribute('aria-label', t('chart', 'Forecast chart: arrow keys move along it'));
  // The width is known once the card is in the page.
  let drawn = 0;
  new ResizeObserver((entries) => {
    const width = Math.floor(entries[0]?.contentRect.width ?? 0);
    if (width > 0 && Math.abs(width - drawn) > 2) {
      drawn = width;
      draw(width);
    }
  }).observe(plot);

  // The same numbers, without hovering: one row for each of a few dates.
  const rows: Sample[] = [];
  for (let i = 0; i <= 6; i += 1) {
    const at = f.now + ((end - f.now) * i) / 6;
    const found = [...samples].reverse().find((p) => p.at <= at) ?? samples[0];
    if (found) rows.push({ ...found, at });
  }
  const table = h('details', { class: 'chart-table' },
    h('summary', null, t('chart', 'As a table')),
    h('table', { class: 'table' },
      h('thead', null, h('tr', null, h('th', { scope: 'col' }, t('chart', 'Date')), ...lines.map((l) => h('th', { scope: 'col' }, l.label)))),
      h('tbody', null, ...rows.map((p) => h('tr', null, h('td', null, date(p.at)), ...lines.map((l) => h('td', null, inBase(state, p[l.key], { whole: true }))))))));

  const periods: Array<[Period, string]> = [
    ['week', t('chart', 'Week')],
    ['month', t('chart', 'Month')],
    ['quarter', t('chart', '3 months')],
    ['half', t('chart', '6 months')],
    ['year', t('chart', 'Year')],
  ];
  return h('section', { class: 'card chart' },
    h('div', { class: 'card-head' },
      h('h2', { class: 'card-title' }, t('chart', 'Forecast')),
      segmented(periods, period, (next) => {
        savePrefs({ period: next });
        nav.render();
      }, t('chart', 'Period'), 'period')),
    legend,
    plot,
    table);
}
