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
  const detections = [];
  const seenLinks = new Set();
  for (const r of records) {
    for (const d of r.detections) {
      if (d.id === 'NET-BROKEN-LINK') {
        if (seenLinks.has(d.evidence)) continue;
        seenLinks.add(d.evidence);
      }
      detections.push({ ref: `D${detections.length + 1}`, ...d, page: r.page, viewport: r.viewport, screenshot: r.screenshot });
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
