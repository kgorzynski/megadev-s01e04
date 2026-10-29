import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { Night } from '../src/digest/types.js';

const line = (o: object) => JSON.stringify(o);
const FULL = [
  line({ at: '2026-10-28T23:00:00+01:00', job: 'b/job', status: 'retry', owner: 'rook', error: 'busy' }),
  line({ at: '2026-10-28T23:01:00+01:00', job: 'b/job', status: 'retry', owner: 'rook', error: 'busy' }),
  line({ at: '2026-10-28T23:02:00+01:00', job: 'b/job', status: 'retry', owner: 'rook', error: 'busy' }),
  line({ at: '2026-10-28T23:03:00+01:00', job: 'b/job', status: 'ok', owner: 'rook' }),
  line({ at: '2026-10-29T01:00:00+01:00', job: 'a/job', status: 'fail', owner: null, error: 'boom' }),
  line({ at: '2026-10-29T02:00:00+01:00', job: 'c/job', status: 'ok', owner: 'lane-07' }),
].join('\n');

let dir: string;
let marker: string | undefined;

beforeEach(() => {
  marker = process.env.LANE_MARKER;
  process.env.LANE_MARKER = 'TEST-MARKER';
  dir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
  writeFileSync(join(dir, '2026-10-01.jsonl'), FULL);
  writeFileSync(join(dir, '2026-10-02.jsonl'), '');
  writeFileSync(join(dir, '2026-10-03.jsonl'), `${FULL}\n{"at":"2026-10-29T03:00:00+01:00","job":"c/j\n`);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  if (marker === undefined) delete process.env.LANE_MARKER;
  else process.env.LANE_MARKER = marker;
});

const app = () =>
  createApp({ adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: dir });

const pageJobs = (html: string) => [...html.matchAll(/<tr(?: class="warn")?><td>([^<]+)<\/td>/g)].map((m) => m[1]);

describe('GET /digest/:night', () => {
  it('200: one table sorted by job, with marks and dashes', async () => {
    const res = await app().request('/digest/2026-10-01');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('TEST-MARKER');
    expect(pageJobs(html)).toEqual(['a/job', 'b/job', 'c/job']);
    expect(html).toContain('<tr class="warn"><td>a/job</td><td>—</td>');
    expect(html).toContain('<tr class="warn"><td>b/job</td>');
    expect(html).toContain('<tr><td>c/job</td>');
    expect(html).toContain('2026-10-29T01:00:00+01:00');
    expect(html).not.toContain('did not parse');
  });

  it('404 for a night with no file', async () => {
    expect((await app().request('/digest/2026-09-30')).status).toBe(404);
    expect((await app().request('/digest/not-a-night')).status).toBe(404);
  });

  it('renders "nothing ran" for an empty night', async () => {
    const res = await app().request('/digest/2026-10-02');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('nothing ran');
    expect(html).not.toContain('<table>');
  });

  it('still renders a night with a bad line, and counts it', async () => {
    const res = await app().request('/digest/2026-10-03');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(pageJobs(html)).toEqual(['a/job', 'b/job', 'c/job']);
    expect(html).toContain('1 line did not parse');
  });
});

describe('GET /api/digest/:night', () => {
  it('200: the same rows, in the same order, as the page', async () => {
    const res = await app().request('/api/digest/2026-10-01');
    expect(res.status).toBe(200);
    const night = (await res.json()) as Night;
    const html = await (await app().request('/digest/2026-10-01')).text();
    expect(night.rows.map((r) => r.job)).toEqual(pageJobs(html));
    expect(night.rows[0]).toEqual({
      job: 'a/job',
      owner: null,
      runs: 1,
      retries: 0,
      lastStatus: 'fail',
      lastError: 'boom',
      firstAt: '2026-10-29T01:00:00+01:00',
      lastAt: '2026-10-29T01:00:00+01:00',
    });
    expect(night.counts).toEqual({ ok: 2, retry: 3, fail: 1 });
    expect(night.badLines).toBe(0);
  });

  it('404 for a night with no file', async () => {
    expect((await app().request('/api/digest/2026-09-30')).status).toBe(404);
  });

  it('the empty night has no rows', async () => {
    const res = await app().request('/api/digest/2026-10-02');
    expect(res.status).toBe(200);
    expect(((await res.json()) as Night).rows).toEqual([]);
  });

  it('a night with a bad line keeps its rows and counts the line', async () => {
    const night = (await (await app().request('/api/digest/2026-10-03')).json()) as Night;
    expect(night.rows.map((r) => r.job)).toEqual(['a/job', 'b/job', 'c/job']);
    expect(night.badLines).toBe(1);
  });
});
