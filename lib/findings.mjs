const EXPECTED = {
  'VIS-OVERFLOW-X': 'Сторінка вміщується в ширину екрана без горизонтального прокручування',
  'VIS-IMG-BROKEN': 'Зображення завантажується',
  'VIS-IMG-DISTORTED': 'Зображення зберігає пропорції',
  'VIS-OVERLAP': 'Кнопки й посилання нічим не перекриті',
  'VIS-TEXT-CLIPPED': 'Текст повністю видно',
  'TXT-SHORTCODE': 'Шорткод виводить свій вміст, а не текст у дужках',
  'TXT-PHP-ERROR': 'На сторінці немає повідомлень про помилки PHP',
  'TXT-MOJIBAKE': 'Текст відображається в правильному кодуванні',
  'TXT-PLACEHOLDER': 'На сторінці немає тестового чи стандартного тексту',
  'TXT-UNRENDERED': 'HTML-сутності й змінні шаблону не видно відвідувачу',
  'TXT-DUP-WORD': 'Слова не повторюються поспіль',
  'TXT-MIXED-SCRIPT': 'Слова написані літерами одного алфавіту',
  'TXT-LANG-LEAK': 'Текст написаний мовою сторінки',
  'TXT-EMPTY-CONTROL': 'Кнопки й посилання мають текст або підпис',
  'NET-HTTP-ERROR': 'Сторінка й ресурси відповідають без помилок',
  'NET-CONSOLE-ERROR': 'У консолі браузера немає помилок',
  'NET-BROKEN-LINK': 'Внутрішні посилання ведуть на існуючі сторінки',
  'AGT-TYPO': 'Текст без друкарських помилок',
  'AGT-GRAMMAR': 'Текст граматично правильний',
  'AGT-UNTRANSLATED': 'Увесь текст перекладено мовою сторінки',
  'AGT-LAYOUT': 'Блоки вирівняні й читаються',
  'CMP-REGRESSION': 'Після зміни сторінка виглядає як до неї, крім запланованих змін',
};

export function mergeFindings(store, confirmed, { runId, now }) {
  const findings = store.findings.map((f) => ({ ...f }));
  const year = now.slice(0, 4);
  let next = findings
    .filter((f) => f.id.startsWith(`BUG-${year}-`))
    .map((f) => Number(f.id.split('-')[2]))
    .reduce((a, b) => Math.max(a, b), 0);
  const touched = [];
  for (const c of confirmed) {
    const existing = findings.find((f) => f.testId === c.testId);
    if (existing) {
      if (existing.lastSeenRunId !== runId) {
        existing.occurrences = (existing.occurrences || 1) + 1;
        existing.lastSeenAt = now;
        existing.lastSeenRunId = runId;
        if (['FIXED', 'VERIFIED', 'CLOSED'].includes(existing.status)) existing.status = 'REOPENED';
      }
      touched.push(existing.id);
      continue;
    }
    next += 1;
    const finding = {
      id: `BUG-${year}-${String(next).padStart(3, '0')}`,
      title: c.title,
      testId: c.testId,
      area: c.area,
      severity: c.severity,
      status: 'OPEN',
      confidence: 'CONFIRMED',
      firstSeenAt: now,
      lastSeenAt: now,
      firstSeenRunId: runId,
      lastSeenRunId: runId,
      occurrences: 1,
      expected: EXPECTED[c.id] ?? null,
      actual: c.actual,
      nextAction: c.note ?? null,
      assignedTo: null,
      githubIssue: null,
      evidence: c.evidence ? [c.evidence] : [],
    };
    findings.push(finding);
    touched.push(finding.id);
  }
  return { store: { ...store, updatedAt: now, findings }, touched };
}
