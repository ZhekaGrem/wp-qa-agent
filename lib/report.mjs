const cell = (s) => String(s ?? '—').replace(/\|/g, '\\|').replace(/\n/g, ' ');

export function renderReport({ plan, summary, applied, result, findingIds }) {
  const lines = [
    '# Звіт візуальної та текстової перевірки', '',
    `- **Запит:** ${plan.request || '—'}`,
    `- **Сайт:** ${plan.baseUrl}`,
    `- **Режим:** ${plan.mode} · **Аудиторія:** ${plan.audience === 'admin' ? 'адміністратор' : 'відвідувач'}`,
    `- **Вердикт:** \`${result.verdict}\``,
    `- **Покриття:** ${summary.coverage.scanned}/${summary.coverage.planned} перевірок (сторінка × ширина екрана)`, '',
  ];
  if (result.reasons.length) lines.push('## Чому такий вердикт', '', ...result.reasons.map((r) => `- ${r}`), '');

  lines.push('## Підтверджені дефекти', '');
  if (!applied.confirmed.length) lines.push('Немає.', '');
  else {
    lines.push('| Джерело | ID | Сторінка | Ширина | Серйозність | Що не так | Фрагмент | Доказ |', '|---|---|---|---:|---|---|---|---|');
    for (const c of applied.confirmed) {
      lines.push(`| ${c.source === 'detector' ? 'детектор' : 'агент'} | ${c.id} | ${cell(c.page)} | ${c.viewport ?? '—'} | ${c.severity} | ${cell(c.title)} | ${cell(c.actual)} | ${cell(c.evidence)} |`);
    }
    lines.push('');
  }

  if (applied.rejected.length) {
    lines.push('## Відхилені автоматичні знахідки', '');
    for (const r of applied.rejected) lines.push(`- ${r.ref} ${r.id} (${r.page}, ${r.viewport}px): ${r.reason ?? 'без причини'}`);
    lines.push('');
  }

  const gaps = [
    ...summary.coverage.missing.map((m) => `${m.key} — ${m.error}`),
    ...applied.undecided.map((ref) => `${ref} — немає рішення рев'ю`),
    ...applied.unreviewedChanges.map((k) => `${k} — зміна без оцінки`),
    ...applied.missingBaselines.map((k) => `${k} — немає еталона`),
  ];
  lines.push('## Що не перевірено або не оцінено', '');
  lines.push(...(gaps.length ? gaps.map((g) => `- ${g}`) : ['Усе заплановане перевірено й оцінено.']), '');

  if (summary.compare?.length) {
    lines.push('## Порівняння з еталоном', '');
    for (const c of summary.compare) lines.push(`- ${c.key}: ${c.status}${c.text ? ` (текст: +${c.text.addedCount}/−${c.text.removedCount})` : ''}`);
    lines.push('');
  }

  lines.push('## Реєстр дефектів', '', findingIds.length ? `Оновлено в \`qa/findings.json\`: ${findingIds.join(', ')}.` : 'Без змін.', '');
  return lines.join('\n');
}
