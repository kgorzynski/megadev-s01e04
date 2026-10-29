import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('readNight', () => {
  it('reads a copy of 2026-10-28: 5 jobs, 1 bad line', () => {
    copyFileSync('runs/2026-10-28.jsonl', join(dir, '2026-10-28.jsonl'));
    const night = readNight(dir, '2026-10-28');
    expect(night).not.toBeNull();
    expect(night!.badLines).toBe(1);
    expect(night!.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
    expect(night!.counts).toEqual({ ok: 10, retry: 4, fail: 1 });

    const refresh = night!.rows.find((r) => r.job === 'fixtures/refresh')!;
    expect(refresh).toEqual({
      job: 'fixtures/refresh',
      owner: 'rook',
      runs: 4,
      retries: 3,
      lastStatus: 'ok',
      lastError: 'upstream 503',
      firstAt: '2026-10-29T01:30:00+01:00',
      lastAt: '2026-10-29T01:37:00+01:00',
    });
    expect(night!.rows.find((r) => r.job === 'notes/backup')).toMatchObject({ lastStatus: 'fail', lastError: 'quota exceeded' });
    expect(night!.rows.find((r) => r.job === 'digest/render')).toMatchObject({ owner: null, lastError: null });
  });

  it('returns null for a night with no file', () => {
    expect(readNight(dir, '2026-01-01')).toBeNull();
  });

  it('returns null for a night that is not a date', () => {
    expect(readNight(dir, '../etc/passwd')).toBeNull();
  });

  it('reads an empty file as a night with no rows', () => {
    writeFileSync(join(dir, '2026-10-30.jsonl'), '');
    expect(readNight(dir, '2026-10-30')).toEqual({
      night: '2026-10-30',
      rows: [],
      counts: { ok: 0, retry: 0, fail: 0 },
      badLines: 0,
    });
  });

  it('counts lines with a wrong shape as bad, never throws', () => {
    writeFileSync(
      join(dir, '2026-10-31.jsonl'),
      [
        '{"at":"2026-10-31T23:00:00+01:00","job":"a","status":"ok","owner":"x"}',
        '{"at":"2026-10-31T23:01:00+01:00","job":"a","status":"weird","owner":"x"}',
        '[1,2]',
        'null',
        '{"at":"2026-10-31T23:02:00+01:00","job":"b","status":"ok"}',
      ].join('\n'),
    );
    const night = readNight(dir, '2026-10-31')!;
    expect(night.rows.map((r) => r.job)).toEqual(['a']);
    expect(night.badLines).toBe(4);
  });
});
