/** When recurring operations happen: section 3.3 of the task, in Europe/Kyiv. */
import { checker, load } from '../tools/load.mjs';
import { at } from './fixture.mjs';

const { check, done } = checker();
const S = await load('core/schedule');
const days = (list) => list.map((t) => {
  const d = new Date(t);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
});
const clock = (list) => [...new Set(list.map((t) => `${new Date(t).getHours()}:${new Date(t).getMinutes()}`))];

const daily = { schedule: { every: 'day', time: '09:00' }, validFrom: at(2026, 10, 1, 10) };
const october = S.occurrences(daily, at(2026, 10, 1, 10), at(2026, 10, 8, 10));
check('daily 09:00 from 1 Oct 10:00 to 8 Oct 10:00: 2 … 8 October', days(october), ['02.10.2026', '03.10.2026', '04.10.2026', '05.10.2026', '06.10.2026', '07.10.2026', '08.10.2026']);

const removed = { ...daily, validTo: at(2026, 10, 5, 12) };
check('removed 5 Oct 12:00: 2 … 5 October', days(S.occurrences(removed, at(2026, 10, 1, 10), at(2026, 10, 8, 10))), ['02.10.2026', '03.10.2026', '04.10.2026', '05.10.2026']);

// Clocks go back an hour in the night to 25 October 2026.
const dst = S.occurrences({ schedule: { every: 'day', time: '09:00' }, validFrom: 0 }, at(2026, 10, 22), at(2026, 10, 29));
check('the week of the change to winter time: exactly 7 times', dst.length, 7);
check('… all at 09:00 local', clock(dst), ['9:0']);
const spring = S.occurrences({ schedule: { every: 'day', time: '09:00' }, validFrom: 0 }, at(2027, 3, 25), at(2027, 4, 1));
check('the week of the change to summer time: 7 times at 09:00', [spring.length, clock(spring)], [7, ['9:0']]);

const monthly31 = { schedule: { every: 'month', time: '00:00', day: 31 }, validFrom: at(2027, 1, 1) };
check('monthly on the 31st, 1 Jan – 1 May 2027', days(S.occurrences(monthly31, at(2027, 1, 1), at(2027, 5, 1))), ['31.01.2027', '28.02.2027', '31.03.2027', '30.04.2027']);
const lastDay = { schedule: { every: 'month', time: '00:00', day: 'last' }, validFrom: 0 };
check('the last day: 28, 29, 30, 31', days(S.occurrences(lastDay, at(2028, 1, 15), at(2028, 5, 1))), ['31.01.2028', '29.02.2028', '31.03.2028', '30.04.2028']);

const leap = { schedule: { every: 'year', time: '00:00', month: 2, day: 29 }, validFrom: 0 };
check('yearly on 29 February, 2027 – 2029', days(S.occurrences(leap, at(2027, 1, 1), at(2029, 12, 31))), ['28.02.2027', '29.02.2028', '28.02.2029']);

const weekly = { schedule: { every: 'week', time: '18:30', weekday: 5 }, validFrom: 0 };
check('weekly on Fridays at 18:30', days(S.occurrences(weekly, at(2026, 10, 1), at(2026, 10, 31))), ['02.10.2026', '09.10.2026', '16.10.2026', '23.10.2026', '30.10.2026']);
check('… at 18:30', clock(S.occurrences(weekly, at(2026, 10, 1), at(2026, 10, 31))), ['18:30']);

const edge = { schedule: { every: 'day', time: '09:00' }, validFrom: at(2026, 10, 2, 9) };
check('(from, to]: the moment `from` itself is out', S.occurrences(edge, at(2026, 10, 2, 9), at(2026, 10, 3, 9)).length, 1);
check('[validFrom, validTo): validFrom itself is in', S.occurrences(edge, at(2026, 10, 1), at(2026, 10, 2, 9)).length, 1);
check('[validFrom, validTo): validTo itself is out', S.occurrences({ ...edge, validTo: at(2026, 10, 3, 9) }, at(2026, 10, 1), at(2026, 10, 9)).length, 1);
check('nothing in an empty interval', S.occurrences(daily, at(2026, 10, 5), at(2026, 10, 5)), []);
check('nothing before validFrom', S.occurrences(daily, at(2026, 9, 1), at(2026, 10, 1, 10)), []);

const started = performance.now();
const five = S.occurrences({ schedule: { every: 'day', time: '09:00' }, validFrom: 0 }, at(2026, 10, 7), at(2031, 10, 7));
check('five years of a daily operation: 1 826', five.length, 1826);
const took = performance.now() - started;
check(`… quickly (${took.toFixed(1)} ms)`, took < 20, true);

check('a month of a daily operation', S.perMonth('day').toFixed(2), '30.44');
check('a month of a weekly operation', S.perMonth('week').toFixed(3), '4.348');

done('schedule');
