const areaOf = (id) => (id.startsWith('VIS-') || id === 'AGT-LAYOUT' || id === 'CMP-REGRESSION' ? 'visual' : id.startsWith('NET-') ? 'network' : 'content');

export function shortHash(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function pathOf(url) {
  try {
    return new URL(url).pathname;
  } catch {
    return String(url);
  }
}

function normalize({ anchor, ...item }) {
  return { ...item, area: areaOf(item.id), testId: `${item.id}@${pathOf(item.page)}@${item.viewport ?? 'any'}@${shortHash(String(anchor))}` };
}

export function applyReview(summary, review = {}) {
  const r = review || {};
  const decisions = new Map((r.decisions ?? []).map((d) => [d.ref, d]));
  const confirmed = [];
  const rejected = [];
  const undecided = [];
  for (const d of summary.detections) {
    const decision = decisions.get(d.ref);
    if (!decision) {
      undecided.push(d.ref);
    } else if (decision.decision === 'confirmed') {
      confirmed.push(normalize({ source: 'detector', id: d.id, page: d.page, viewport: d.viewport, severity: decision.severity ?? d.severity, title: d.message, evidence: d.screenshot, actual: d.evidence, note: decision.reason ?? null, anchor: d.selector || d.match || d.evidence }));
    } else {
      rejected.push({ ref: d.ref, id: d.id, page: d.page, viewport: d.viewport, reason: decision.reason });
    }
  }
  for (const f of r.agentFindings ?? []) {
    confirmed.push(normalize({ source: 'agent', id: f.id, page: f.page, viewport: f.viewport ?? null, severity: f.severity ?? 'low', title: f.title, evidence: f.evidence ?? null, actual: f.quote ?? f.title, note: null, anchor: f.quote ?? f.title }));
  }
  const compareDecisions = new Map((r.compareDecisions ?? []).map((c) => [c.key, c]));
  const unreviewedChanges = [];
  const missingBaselines = [];
  for (const c of summary.compare ?? []) {
    if (c.status === 'NO_BASELINE' || c.status === 'BASELINE_FAILED') {
      missingBaselines.push(c.key);
      continue;
    }
    if (c.status !== 'CHANGED') continue;
    const decision = compareDecisions.get(c.key);
    if (!decision) unreviewedChanges.push(c.key);
    else if (decision.decision === 'regression') {
      confirmed.push(normalize({ source: 'agent', id: 'CMP-REGRESSION', page: c.page, viewport: c.viewport, severity: decision.severity ?? 'medium', title: decision.reason, evidence: `diffs/${c.key}`, actual: decision.reason, note: null, anchor: c.key }));
    }
  }
  return { confirmed, rejected, undecided, unreviewedChanges, missingBaselines };
}

export function scanVerdict(summary, applied) {
  if (summary.coverage.status === 'BLOCKED') return { verdict: 'BLOCKED', reasons: ['Жодна сторінка не була просканована.'] };
  const gaps = [];
  if (summary.coverage.status === 'INCOMPLETE') gaps.push(`Не проскановано ${summary.coverage.missing.length} з ${summary.coverage.planned} перевірок.`);
  if (applied.confirmed.length) return { verdict: 'FAIL', reasons: [`Підтверджено дефектів: ${applied.confirmed.length}.`, ...gaps] };
  if (applied.undecided.length) gaps.push(`Знахідки без рішення рев'ю: ${applied.undecided.join(', ')}.`);
  if (applied.unreviewedChanges.length) gaps.push(`Зміни без оцінки: ${applied.unreviewedChanges.join(', ')}.`);
  if (applied.missingBaselines.length) gaps.push(`Немає еталона (baseline) для: ${applied.missingBaselines.join(', ')}.`);
  return gaps.length ? { verdict: 'REVIEW', reasons: gaps } : { verdict: 'PASS', reasons: [] };
}
