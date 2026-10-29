import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

let dir: string;
let marker: string | undefined;

beforeEach(() => {
  marker = process.env.LANE_MARKER;
  delete process.env.LANE_MARKER;
  dir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
  copyFileSync('runs/2026-10-27.jsonl', join(dir, '2026-10-27.jsonl'));
  copyFileSync('runs/2026-10-28.jsonl', join(dir, '2026-10-28.jsonl'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  if (marker === undefined) delete process.env.LANE_MARKER;
  else process.env.LANE_MARKER = marker;
});

const app = () =>
  createApp({ adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: dir });

describe('board links each night to its digest', () => {
  it('links both nights with their counts, and each link renders', async () => {
    const html = await (await app().request('/')).text();
    expect(html).toContain('<a href="/digest/2026-10-27">2026-10-27</a>');
    expect(html).toContain('<a href="/digest/2026-10-28">2026-10-28</a>');
    expect(html).toMatch(/2026-10-28<\/a> <span class="mute">ok 10 · retry <\/span><span class="warn">4<\/span><span class="mute"> · fail <\/span><span class="warn">1</);
    expect(html).toMatch(/2026-10-27<\/a> <span class="mute">ok 7 · retry <\/span><span class="mute">0</);

    const hrefs = [...html.matchAll(/href="(\/digest\/[^"]+)"/g)];
    expect(hrefs).toHaveLength(2);
    for (const href of hrefs) {
      const res = await app().request(href[1]!);
      expect(res.status).toBe(200);
      expect(await res.text()).toContain('<table>');
    }
  });
});
