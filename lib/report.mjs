// Flattens any agent- or LLM-authored value to a single line so it can never
// inject Markdown structure (e.g. a "## Heading") into the report.
const line = (v) => String(v ?? '—').replace(/\s*\r?\n\s*/g, ' ');
const cell = (s) => line(s).replace(/\|/g, '\\|');
// Page addresses are shown the way a person types them (Cyrillic, not %D0%BA…).
const address = (url) => {
  try {
    return decodeURI(String(url));
  } catch {
    return String(url);
  }
};
const widths = (item) => (item.viewports?.length ? item.viewports : [item.viewport ?? '—']).join(', ');

export function renderReport({ plan, summary, applied, result, findingIds }) {
  const lines = [
    '# Звіт візуальної та текстової перевірки', '',
    `- **Запит:** ${line(plan.request || '—')}`,
    `- **Сайт:** ${plan.baseUrl}`,
    `- **Режим:** ${plan.mode} · **Аудиторія:** ${plan.audience === 'admin' ? 'адміністратор' : 'відвідувач'}`,
    `- **Вердикт:** \`${result.verdict}\``,
    `- **Покриття:** ${summary.coverage.scanned}/${summary.coverage.planned} перевірок (сторінка × ширина екрана)`, '',
  ];
  if (result.reasons.length) lines.push('## Чому такий вердикт', '', ...result.reasons.map((r) => `- ${line(r)}`), '');

  lines.push('## Підтверджені дефекти', '');
  if (!applied.confirmed.length) lines.push('Немає.', '');
  else {
    lines.push('| Джерело | ID | Сторінка | Ширина | Серйозність | Що не так | Фрагмент | Доказ |', '|---|---|---|---:|---|---|---|---|');
    for (const c of applied.confirmed) {
      lines.push(`| ${c.source === 'detector' ? 'детектор' : 'агент'} | ${c.id} | ${cell(address(c.page))} | ${widths(c)} | ${c.severity} | ${cell(c.title)} | ${cell(c.actual)} | ${cell(c.evidence)} |`);
    }
    lines.push('');
  }

  if (applied.rejected.length) {
    lines.push('## Відхилені автоматичні знахідки', '');
    for (const r of applied.rejected) lines.push(`- ${r.ref} ${r.id} (${line(address(r.page))}, ${widths(r)}px): ${line(r.reason ?? 'без причини')}`);
    lines.push('');
  }

  const gaps = [
    ...summary.coverage.missing.map((m) => `${m.key} — ${line(m.error)}`),
    ...applied.undecided.map((ref) => `${ref} — немає рішення рев'ю`),
    ...applied.unreviewedChanges.map((k) => `${k} — зміна без оцінки`),
    ...applied.missingBaselines.map((k) => `${k} — немає еталона`),
    ...(applied.invalid ?? []).map((i) => `${i.ref ?? i.key} — некоректне рішення рев'ю (${line(i.value)})`),
  ];
  lines.push('## Що не перевірено або не оцінено', '');
  lines.push(...(gaps.length ? gaps.map((g) => `- ${g}`) : ['Усе заплановане перевірено й оцінено.']), '');

  if (summary.compare?.length) {
    lines.push('## Порівняння з еталоном', '');
    for (const c of summary.compare) lines.push(`- ${line(c.key)}: ${line(c.status)}${c.text ? ` (текст: +${c.text.addedCount}/−${c.text.removedCount})` : ''}`);
    lines.push('');
  }

  lines.push('## Реєстр дефектів', '', findingIds.length ? `Оновлено в \`qa/findings.json\`: ${findingIds.join(', ')}.` : 'Без змін.', '');
  return lines.join('\n');
}
