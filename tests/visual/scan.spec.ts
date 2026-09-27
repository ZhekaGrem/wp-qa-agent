import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { runProbes, stabilizePage } from '../../lib/probes.mjs';
import { detectTextDefects } from '../../lib/text-detectors.mjs';
import { checkUrl } from '../../lib/safe-url.mjs';
import { guardReadOnly } from '../../lib/read-only-route.mjs';
import { checkLink } from '../../lib/link-check.mjs';
import { viewportSize } from '../../lib/plan.mjs';
import { diffText } from '../../lib/text-diff.mjs';
import { writeRecord } from '../../lib/aggregate.mjs';

const planFile = process.env.QA_SCAN_PLAN;
const runDir = process.env.QA_RUN_DIR || '';
const plan: any = planFile ? JSON.parse(fs.readFileSync(planFile, 'utf8')) : null;

test.skip(!plan || !runDir, 'The visual project runs only through scripts/visual-qa.mjs');
test.describe.configure({ timeout: 180_000 });

const SHOT = { fullPage: true, animations: 'disabled' as const, caret: 'hide' as const };

if (plan) {
  if (plan.audience === 'admin') test.use({ storageState: '.auth/admin.json' });
  const origin = new URL(plan.baseUrl).origin;

  for (const width of plan.viewports as number[]) {
    test.describe(`${width}px`, () => {
      test.use({ viewport: viewportSize(width), isMobile: width < 768, hasTouch: width < 768, deviceScaleFactor: 1 });

      for (const target of plan.pages) {
        test(`${target.label} @ ${width}`, async ({ page }, testInfo) => {
          const key = `${target.slug}@${width}`;
          const record: any = { page: target.url, label: target.label, viewport: width, key, status: null, detections: [], network: [], console: [], blocked: [], screenshot: null, textFile: null, compare: null };
          try {
            const guard = checkUrl(target.url, { baseUrl: plan.baseUrl, audience: plan.audience });
            if (!guard.allowed) throw new Error(`refused by URL filter: ${guard.reason}`);

            // Read-only inside the page: no write request leaves the browser,
            // and navigations or redirect hops to refused URLs are stopped.
            // A refused redirect of the planned page itself: the page is not
            // scanned, and the error says where the site tried to send us.
            let redirectBlock: { to: string } | null = null;
            await guardReadOnly(page, {
              origin,
              onBlocked: (entry: string, info?: any) => {
                record.blocked.push(entry);
                if (info?.mainFrame && info.redirectFrom === target.url && !redirectBlock) redirectBlock = { to: info.to };
              },
              allowNavigation: (url: string) => checkUrl(url, { baseUrl: plan.baseUrl, audience: plan.audience }).allowed,
            });
            const redirectError = () => {
              if (!redirectBlock) return null;
              const to = new URL(redirectBlock.to);
              return new Error(to.origin !== origin
                ? `site redirects to ${to.origin}; set QA_BASE_URL to it`
                : `page redirects to a URL the filter refuses (${redirectBlock.to}); not scanned`);
            };
            page.on('console', (msg) => { if (msg.type() === 'error') record.console.push(msg.text().slice(0, 300)); });
            page.on('pageerror', (err) => record.console.push(`uncaught: ${err.message.slice(0, 300)}`));
            page.on('response', (res) => { if (res.status() >= 400) record.network.push({ url: res.url(), status: res.status() }); });

            let response;
            try {
              response = await page.goto(target.url, { waitUntil: 'load', timeout: 45_000 });
            } catch (error) {
              throw redirectError() ?? error;
            }
            const refusedRedirect = redirectError();
            if (refusedRedirect) throw refusedRedirect;
            record.status = response?.status() ?? null;
            const finalUrl = response?.url() ?? target.url;
            if (new URL(finalUrl).origin !== origin) {
              throw new Error(`site redirects to ${new URL(finalUrl).origin}; set QA_BASE_URL to it`);
            }
            await stabilizePage(page);
            const probes = await runProbes(page);

            // A script or redirect to a URL the filter *allows* is never
            // stopped by the guard, so without this check the scan would
            // silently keep going against the new document while the record
            // still claims it describes target.url. A *refused* navigation
            // is answered with an empty 204 (see lib/read-only-route.mjs),
            // which keeps the browser on the current document, so page.url()
            // genuinely stays put in that case and a plain comparison here
            // is enough — no exemption needed.
            const stripHash = (u: string) => u.split('#')[0];
            if (stripHash(page.url()) !== stripHash(finalUrl)) {
              throw new Error(`page navigated away to ${page.url()} during the scan`);
            }

            if (record.status && record.status >= 400) {
              record.detections.push({ id: 'NET-HTTP-ERROR', severity: record.status >= 500 ? 'critical' : 'high', message: `Page returned HTTP ${record.status}`, selector: '', match: String(record.status), evidence: target.url });
            }
            record.detections.push(...probes.detections, ...detectTextDefects(probes.blocks, probes.meta));
            for (const n of record.network) {
              if (n.url === finalUrl) continue;
              record.detections.push({ id: 'NET-HTTP-ERROR', severity: 'medium', message: `Resource returned HTTP ${n.status}`, selector: '', match: String(n.status), evidence: n.url });
            }
            if (record.console.length) {
              record.detections.push({ id: 'NET-CONSOLE-ERROR', severity: 'low', message: `${record.console.length} console error(s)`, selector: '', match: '', evidence: record.console.slice(0, 3).join(' | ') });
            }

            // Links are checked once per page, on the first viewport of the plan.
            if (plan.checkLinks && width === plan.viewports[0]) {
              for (const link of probes.links.slice(0, 50)) {
                if (link === finalUrl || !checkUrl(link, { baseUrl: plan.baseUrl, audience: plan.audience }).allowed) continue;
                const res = await checkLink(page.request, link, { baseUrl: plan.baseUrl, audience: plan.audience }).catch(() => null);
                if (res?.checked && res.status >= 400) {
                  record.detections.push({ id: 'NET-BROKEN-LINK', severity: 'medium', message: `Link returns HTTP ${res.status}`, selector: '', match: String(res.status), evidence: link });
                }
              }
            }

            const masks = plan.masks.map((m: string) => page.locator(m));
            fs.mkdirSync(path.join(runDir, 'screenshots'), { recursive: true });
            fs.mkdirSync(path.join(runDir, 'text'), { recursive: true });
            await page.screenshot({ ...SHOT, mask: masks, path: path.join(runDir, 'screenshots', `${key}.png`) });
            record.screenshot = `screenshots/${key}.png`;
            fs.writeFileSync(path.join(runDir, 'text', `${key}.json`), JSON.stringify({ url: target.url, lang: probes.meta.lang, title: probes.meta.title, blocks: probes.blocks }, null, 2));
            record.textFile = `text/${key}.json`;

            if (plan.mode !== 'scan') {
              const name = [plan.host, `${key}.png`];
              const baselinePng = testInfo.snapshotPath(...name, { kind: 'screenshot' });
              const baselineText = baselinePng.replace(/\.png$/, '.text.json');
              const texts = probes.blocks.map((b: any) => b.text);
              if (plan.mode === 'baseline') {
                try {
                  await expect(page).toHaveScreenshot(name, { ...SHOT, mask: masks, timeout: 20_000 });
                  fs.writeFileSync(baselineText, JSON.stringify(texts));
                  record.compare = { status: 'BASELINE_SAVED' };
                } catch (error: any) {
                  record.compare = { status: 'BASELINE_FAILED', error: String(error?.message ?? error).slice(0, 300) };
                }
              } else if (!fs.existsSync(baselinePng)) {
                record.compare = { status: 'NO_BASELINE' };
              } else {
                let visual = 'SAME';
                try {
                  await expect(page).toHaveScreenshot(name, { ...SHOT, mask: masks, maxDiffPixelRatio: 0.01, timeout: 20_000 });
                } catch {
                  visual = 'CHANGED';
                  if (fs.existsSync(testInfo.outputDir)) fs.cpSync(testInfo.outputDir, path.join(runDir, 'diffs', key), { recursive: true });
                }
                const text = fs.existsSync(baselineText) ? diffText(JSON.parse(fs.readFileSync(baselineText, 'utf8')), texts) : null;
                const textChanged = Boolean(text && (text.addedCount || text.removedCount));
                record.compare = { status: visual === 'SAME' && !textChanged ? 'SAME' : 'CHANGED', visual, text };
              }
            }
          } catch (error: any) {
            record.error = String(error?.message ?? error).slice(0, 500);
            throw error;
          } finally {
            writeRecord(runDir, key, record);
          }
        });
      }
    });
  }
}
