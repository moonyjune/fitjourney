import { describe, expect, it } from '@jest/globals';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { APP_VERSION } from '../../utils/buildInfo';

describe('release notes', () => {
  const notes = readFileSync(join(__dirname, '../../../RELEASE_NOTES.md'), 'utf8');
  const versions = [...notes.matchAll(/^## (\d+\.\d{2})\s*$/gm)].map((m) => m[1]);
  const steps = new Map([...notes.matchAll(/^\| (\d+\.\d{2}) \| (.*?) \| (.*?) \|$/gm)].map((m) => [m[1], { schema: m[2], deploy: m[3] }]));

  it('the version is A.BC', () => {
    expect(APP_VERSION).toMatch(/^\d\.\d{2}$/);
  });
  it('the newest entry is the version shown in the app, and entries count down without gaps', () => {
    expect(versions[0]).toBe(APP_VERSION);
    const n = (v: string) => Math.round(parseFloat(v) * 100);
    versions.forEach((v, i) => expect(n(v)).toBe(n(versions[0]) - i));
    expect(versions[versions.length - 1]).toBe('0.01');
  });
  it('every release has a server-steps row: schema.sql yes/no and the functions to redeploy (existing ones) or —', () => {
    expect([...steps.keys()]).toEqual(versions);
    for (const [, row] of steps) {
      expect(['yes', 'no']).toContain(row.schema);
      if (row.deploy === '—') continue;
      for (const name of row.deploy.split(', ')) expect(existsSync(join(__dirname, '../../../supabase/functions', name, 'index.ts'))).toBe(true);
    }
  });
});
