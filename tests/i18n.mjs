/**
 * The dictionaries in src/locales against the strings the interface shows:
 * no stale keys, the same placeholders as the English text, a form for every
 * plural category of the language — and the lookup itself in src/core/i18n.ts.
 * A string a dictionary lacks is only reported: it is shown in English.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checker, load, root } from '../tools/load.mjs';
import { compare, dictionaries, extract } from '../tools/i18n.mjs';

const { check, done } = checker();
const I = await load('core/i18n');
const strings = await extract();
const all = await dictionaries();
const placeholders = (text) => [...new Set(text.match(/\{\w+\}/g) ?? [])].sort();

check('a dictionary per language', Object.keys(all).sort(), Object.keys(I.LANGUAGES).filter((code) => code !== 'en').sort());

for (const [language, dictionary] of Object.entries(all)) {
  const { missing, unused } = compare(strings, dictionary);
  check(`${language}: no unused strings`, unused, []);
  const lacking = Object.entries(missing).flatMap(([context, texts]) => Object.keys(texts).map((text) => `${context} / ${text}`));
  if (lacking.length) console.log(`  ${language}: ${lacking.length} strings not translated (shown in English)`);

  const categories = new Intl.PluralRules(language).resolvedOptions().pluralCategories.slice().sort();
  const problems = [];
  for (const [context, texts] of Object.entries(dictionary)) {
    for (const [text, value] of Object.entries(texts)) {
      const forms = strings[context]?.[text];
      if (forms === undefined) continue;
      const expected = placeholders(text);
      if (forms === null || typeof value === 'string') {
        if (typeof value !== 'string' || !value.trim()) problems.push(`${context} / ${text}: not a text`);
        else if (JSON.stringify(placeholders(value)) !== JSON.stringify(expected)) problems.push(`${context} / ${text}: placeholders ${placeholders(value)}`);
        continue;
      }
      if (!value || typeof value !== 'object') {
        problems.push(`${context} / ${text}: neither a text nor plural forms`);
        continue;
      }
      if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(categories)) {
        problems.push(`${context} / ${text}: forms ${Object.keys(value)}, the language has ${categories}`);
      }
      for (const [category, form] of Object.entries(value)) {
        // A form may leave the number out ("one entry"), never anything else.
        const needed = expected.filter((name) => name !== '{count}');
        const got = placeholders(form);
        if (!got.every((name) => expected.includes(name)) || !needed.every((name) => got.includes(name))) {
          problems.push(`${context} / ${text} [${category}]: placeholders ${got}`);
        }
      }
    }
  }
  check(`${language}: well-formed translations`, problems, []);
}

// The lookup
check('english by default', I.t('dialog', 'Cancel'), 'Cancel');
check('placeholders filled', I.t('accounts', 'Last: {date}', { date: '1 Oct' }), 'Last: 1 Oct');
check('english plural: one', I.tn('time', '{count} day ago', '{count} days ago', 1), '1 day ago');
check('english plural: other', I.tn('time', '{count} day ago', '{count} days ago', 3), '3 days ago');
I.setLanguage('ru');
check('translated', I.t('dialog', 'Cancel'), all.ru.dialog.Cancel);
check('unknown text stays english', I.t('dialog', 'No such thing'), 'No such thing');
check('unknown context stays english', I.t('nowhere', 'Cancel'), 'Cancel');
const days = all.ru.time['{count} days ago'];
check('russian plural: one', I.tn('time', '{count} day ago', '{count} days ago', 21), days.one.replace('{count}', '21'));
check('russian plural: few', I.tn('time', '{count} day ago', '{count} days ago', 3), days.few.replace('{count}', '3'));
check('russian plural: many', I.tn('time', '{count} day ago', '{count} days ago', 11), days.many.replace('{count}', '11'));
check('left to right', I.isRightToLeft(), false);
I.setLanguage('uk');
const ukDays = all.uk.time['{count} days ago'];
check('ukrainian plural: few', I.tn('time', '{count} day ago', '{count} days ago', 22), ukDays.few.replace('{count}', '22'));
check('ukrainian plural: many', I.tn('time', '{count} day ago', '{count} days ago', 5), ukDays.many.replace('{count}', '5'));
I.setLanguage('ar');
check('arabic is right to left', I.isRightToLeft(), true);
I.setLanguage('en');
check('browser language', I.detectLanguage(['nl-NL', 'pt-BR', 'en']), 'pt');
check('browser language: ukrainian', I.detectLanguage(['uk-UA', 'ru', 'en']), 'uk');
check('browser language: none known', I.detectLanguage(['nl', 'sv']), 'en');
check('language names', Object.keys(I.LANGUAGES).length, 17);

// A translator agent sometimes appends a second object with a context's name: JSON.parse keeps the last, silently.
for (const code of Object.keys(all)) {
  const raw = readFileSync(join(root, 'src', 'locales', `${code}.json`), 'utf8');
  const contexts = [...raw.matchAll(/^  "([\w-]+)": \{/gm)].map((m) => m[1]);
  check(`${code}: each context once`, contexts.length, new Set(contexts).size);
}
// "Cashflow" is a name: no dictionary translates it.
for (const [code, dictionary] of Object.entries(all)) {
  const lost = Object.values(dictionary).flatMap((texts) => Object.entries(texts)).filter(([en, tr]) => en.includes('Cashflow') && !JSON.stringify(tr).includes('Cashflow'));
  check(`${code}: "Cashflow" left as it is`, lost.map(([en]) => en), []);
}

done('i18n');
