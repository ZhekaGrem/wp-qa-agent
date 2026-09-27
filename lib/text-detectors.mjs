// Text rules run in Node over the visible text blocks extracted from a page.
// They produce candidates; the agent confirms or rejects each one.

// Windows-1252 characters that UTF-8 lead bytes turn into when mis-decoded.
const CP1252_HIGH = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
const MOJIBAKE = new RegExp(`[ÃÂÐÑ][\\u0080-\\u00BF${CP1252_HIGH}]|â€|\\uFFFD`, 'u');

const regexRule = (id, severity, message, re) => ({ id, severity, message, find: (text) => text.match(re)?.[0] ?? null });

function mixedScriptWord(text) {
  for (const word of text.match(/\p{L}+/gu) || []) {
    if (/\p{Script=Cyrillic}/u.test(word) && /\p{Script=Latin}/u.test(word)) return word;
  }
  return null;
}

function languageLeak(text, lang) {
  const primary = String(lang || '').toLowerCase().split('-')[0];
  const foreign = primary === 'uk' ? /[ыэъёЫЭЪЁ]/u : primary === 'ru' ? /[іїєґІЇЄҐ]/u : null;
  if (!foreign) return null;
  for (const word of text.match(/\p{Script=Cyrillic}+/gu) || []) {
    if (foreign.test(word)) return word;
  }
  return null;
}

const RULES = [
  regexRule('TXT-PHP-ERROR', 'high', 'PHP error text is visible on the page',
    /\b(?:Warning|Notice|Deprecated|Fatal error|Parse error|Catchable fatal error)\s*:\s[^\n]{0,300}?(?:on line \d+|\bin \/\S+)/i),
  regexRule('TXT-PHP-ERROR', 'high', 'WordPress critical error message is visible',
    /There has been a critical error on (?:this|your) website/i),
  regexRule('TXT-SHORTCODE', 'medium', 'Unrendered shortcode is visible',
    /\[\/[a-z][\w-]*\]|\[[a-z][a-z0-9]*_[a-z0-9_]*(?:\s[^\]\n]*)?\]|\[(?:contact-form-7|contact-form|elementor-template|gallery|caption|embed|audio|video|playlist|products?)(?:\s[^\]\n]*)?\]|\[[a-z][\w-]*\s+[\w-]+=(?:"[^"\]\n]*"|'[^'\]\n]*'|[^\s\]]+)[^\]\n]*\]/i),
  regexRule('TXT-MOJIBAKE', 'medium', 'Broken character encoding (mojibake)', MOJIBAKE),
  regexRule('TXT-PLACEHOLDER', 'medium', 'Placeholder or default WordPress text',
    /lorem ipsum|dolor sit amet|\bSample Page\b|Hello world!|Just another WordPress site|\bexample\.com\b|Привіт, світ!|Ще один сайт на WordPress|Ещё один сайт на WordPress|Приклад сторінки|Пример страницы/i),
  regexRule('TXT-UNRENDERED', 'medium', 'Raw HTML entity, tag or template variable is visible',
    /&(?:nbsp|amp|lt|gt|quot|#\d+|#x[0-9a-f]+);|<\/?(?:p|div|span|br|strong|em|a|h[1-6])\b[^>]*>|\{\{\s*[\w.]+\s*\}\}|%(?:\d+\$)?[sd](?!\p{L})/iu),
  regexRule('TXT-DUP-WORD', 'low', 'Repeated word',
    /(?<![\p{L}\p{N}])(\p{L}{2,})\s+\1(?![\p{L}\p{N}])/iu),
  { id: 'TXT-MIXED-SCRIPT', severity: 'medium', message: 'Word mixes Cyrillic and Latin letters', find: (text) => mixedScriptWord(text) },
  { id: 'TXT-LANG-LEAK', severity: 'medium', message: 'Letters of another language on this page', find: (text, meta) => languageLeak(text, meta.lang) },
];

function excerpt(text, match) {
  const i = Math.max(0, text.indexOf(match));
  const start = Math.max(0, i - 40);
  const end = Math.min(text.length, i + match.length + 40);
  return `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`;
}

export function detectTextDefects(blocks, meta = {}) {
  const out = [];
  for (const block of blocks) {
    const seen = new Set();
    for (const rule of RULES) {
      if (seen.has(rule.id)) continue;
      const match = rule.find(block.text, meta);
      if (!match) continue;
      seen.add(rule.id);
      out.push({ id: rule.id, severity: rule.severity, message: rule.message, match, evidence: excerpt(block.text, match), selector: block.selector });
    }
  }
  return out;
}
