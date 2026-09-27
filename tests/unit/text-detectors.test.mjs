import test from 'node:test';
import assert from 'node:assert/strict';
import { detectTextDefects } from '../../lib/text-detectors.mjs';

const ids = (text, lang = '') => [...new Set(detectTextDefects([{ text, selector: 'p' }], { lang }).map((d) => d.id))].sort();

const positives = [
  ['Warning: Undefined variable $x in /var/www/html/wp-content/themes/t/functions.php on line 12', '', ['TXT-PHP-ERROR']],
  ['There has been a critical error on this website.', '', ['TXT-PHP-ERROR']],
  ['Напишіть нам [contact-form-7 id="12" title="Form"]', '', ['TXT-SHORTCODE']],
  ['[vc_row][vc_column]Текст', '', ['TXT-SHORTCODE']],
  ['[gallery ids="1,2,3"]', '', ['TXT-SHORTCODE']],
  ['[my-banner id="3"]', '', ['TXT-SHORTCODE']],
  ['Text [/my-banner] end', '', ['TXT-SHORTCODE']],
  ['ÐŸÑ€Ð¸Ð²Ñ–Ñ‚', '', ['TXT-MOJIBAKE']],
  ['Itâ€™s great', '', ['TXT-MOJIBAKE']],
  ['cafÃ© menu', '', ['TXT-MOJIBAKE']],
  ['Lorem ipsum dolor sit amet', '', ['TXT-PLACEHOLDER']],
  ['Just another WordPress site', '', ['TXT-PLACEHOLDER']],
  ['Ціна&nbsp;100 грн', '', ['TXT-UNRENDERED']],
  ['Hello {{first_name}}', '', ['TXT-UNRENDERED']],
  ['Showing %s results', '', ['TXT-UNRENDERED']],
  ['<p>Text</p>', '', ['TXT-UNRENDERED']],
  ['Ми ми працюємо', '', ['TXT-DUP-WORD']],
  ['see the the docs', '', ['TXT-DUP-WORD']],
  ['Офіс у місті Kиїв', '', ['TXT-MIXED-SCRIPT']],
  ['Добро пожаловать в наш магазин объявлений', 'uk', ['TXT-LANG-LEAK']],
  ['Ласкаво просимо до нашої крамниці', 'ru', ['TXT-LANG-LEAK']],
];

for (const [text, lang, expected] of positives) {
  test(`detects ${expected.join(',')} in "${text}"`, () => {
    assert.deepEqual(ids(text, lang), expected);
  });
}

const clean = [
  ["Ім'я та прізвище вказуйте повністю.", 'uk'],
  ['Наші клієнти: España, São Paulo, Zürich.', 'uk'],
  ['Знижка 100% на першу консультацію.', 'uk'],
  ['Джерело [1] і примітка [sic].', 'uk'],
  ['Warning: slippery floor after rain', 'en'],
  ['Так, так — ми працюємо щодня.', 'uk'],
  ['Телефон: +380 44 000 00 00', 'uk'],
  ['Ласкаво просимо до нашої крамниці', 'en'],
  ['https://example.ua/дуже/довгий/шлях', 'uk'],
  ['See [English-version] for details', 'en'],
  ['Побачити [important-note] нижче', 'uk'],
  ['[re-edited] text', 'en'],
];

for (const [text, lang] of clean) {
  test(`does not flag "${text}"`, () => {
    assert.deepEqual(ids(text, lang), []);
  });
}

test('detection carries a readable excerpt and the selector', () => {
  const [d] = detectTextDefects([{ text: 'Footer: [contact-form-7 id="9"] end', selector: 'footer > p' }], {});
  assert.equal(d.selector, 'footer > p');
  assert.equal(d.match, '[contact-form-7 id="9"]');
  assert.match(d.evidence, /Footer: \[contact-form-7 id="9"\] end/);
});
