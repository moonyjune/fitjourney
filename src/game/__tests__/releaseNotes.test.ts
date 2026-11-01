import { describe, expect, it } from '@jest/globals';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { APP_VERSION } from '../../utils/buildInfo';

/** Functions an older release deployed that were removed later (story-chapter: the Map story, replaced by boss-banter). */
const RETIRED_FUNCTIONS = new Set(['story-chapter']);

describe('release notes', () => {
  const notes = readFileSync(join(__dirname, '../../../RELEASE_NOTES.md'), 'utf8');
  const versions = [...notes.matchAll(/^## (\d+\.\d+\.\d+)\s*$/gm)].map((m) => m[1]);
  const steps = new Map([...notes.matchAll(/^\| (\d+\.\d+\.\d+) \| (.*?) \| (.*?) \|$/gm)].map((m) => [m[1], { schema: m[2], deploy: m[3] }]));
  const parts = (v: string) => v.split('.').map(Number);

  it('the version is A.B.C', () => {
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
  it('the newest entry is the version shown in the app, and each release is one step up from the one before', () => {
    expect(versions[0]).toBe(APP_VERSION);
    expect(versions[versions.length - 1]).toBe('0.1.0');
    // Newest first: each entry is the one below it raised by exactly one step (C + 1, B + 1 with C = 0, or A + 1 with B = C = 0).
    for (let i = 0; i < versions.length - 1; i++) {
      const [a, b, c] = parts(versions[i + 1]);
      const next = [`${a}.${b}.${c + 1}`, `${a}.${b + 1}.0`, `${a + 1}.0.0`];
      expect(next).toContain(versions[i]);
    }
  });
  it('every release has a server-steps row: schema.sql yes/no and the functions to redeploy (existing ones) or —', () => {
    expect([...steps.keys()]).toEqual(versions);
    for (const [, row] of steps) {
      expect(['yes', 'no']).toContain(row.schema);
      if (row.deploy === '—') continue;
      for (const name of row.deploy.split(', ')) if (!RETIRED_FUNCTIONS.has(name)) expect(existsSync(join(__dirname, '../../../supabase/functions', name, 'index.ts'))).toBe(true);
    }
  });
});
