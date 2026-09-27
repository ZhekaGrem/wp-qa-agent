import fs from 'node:fs';
import path from 'node:path';

export function writeRecord(runDir, key, record) {
  const dir = path.join(runDir, 'records');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${key}.json`), JSON.stringify(record, null, 2));
}

export function aggregateRun(runDir, plan) {
  const planned = plan.pages.flatMap((p) => plan.viewports.map((w) => ({ key: `${p.slug}@${w}`, page: p.url, viewport: w })));
  const records = [];
  const missing = [];
  for (const item of planned) {
    const file = path.join(runDir, 'records', `${item.key}.json`);
    const record = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
    if (record && record.screenshot) records.push(record);
    else missing.push({ ...item, error: record?.error ?? 'no record written' });
  }
  // One detection per defect: a broken link once per run, and a detection
  // that is identical at several viewports (same id, page, element, match and
  // evidence: typically text, console and network findings) once, listing
  // every viewport and screenshot. The first viewport stays the primary
  // `viewport`/`screenshot`.
  const detections = [];
  const seenLinks = new Set();
  const byIdentity = new Map();
  for (const r of records) {
    for (const d of r.detections) {
      if (d.id === 'NET-BROKEN-LINK') {
        if (seenLinks.has(d.evidence)) continue;
        seenLinks.add(d.evidence);
      }
      const identity = JSON.stringify([d.id, r.page, d.selector ?? '', d.match ?? '', d.evidence ?? '']);
      const same = byIdentity.get(identity);
      if (same) {
        if (!same.viewports.includes(r.viewport)) {
          same.viewports.push(r.viewport);
          same.screenshots.push(r.screenshot);
        }
        continue;
      }
      const detection = { ref: `D${detections.length + 1}`, ...d, page: r.page, viewport: r.viewport, screenshot: r.screenshot, viewports: [r.viewport], screenshots: [r.screenshot] };
      byIdentity.set(identity, detection);
      detections.push(detection);
    }
  }
  const byId = {};
  for (const d of detections) byId[d.id] = (byId[d.id] || 0) + 1;
  const compare = records.filter((r) => r.compare).map((r) => ({ key: r.key, page: r.page, viewport: r.viewport, ...r.compare }));
  const status = records.length === 0 ? 'BLOCKED' : missing.length ? 'INCOMPLETE' : 'COMPLETE';
  return {
    runId: plan.runId,
    mode: plan.mode,
    request: plan.request,
    coverage: { planned: planned.length, scanned: records.length, missing, status },
    byId,
    detections,
    compare,
  };
}
