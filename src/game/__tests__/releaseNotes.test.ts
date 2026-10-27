import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';
import { APP_VERSION } from '../../utils/buildInfo';

describe('release notes', () => {
  const notes = readFileSync(join(__dirname, '../../../RELEASE_NOTES.md'), 'utf8');
  const versions = [...notes.matchAll(/^## (\S+)/gm)].map((m) => m[1]);

  it('the version is A.BC', () => {
    expect(APP_VERSION).toMatch(/^\d\.\d{2}$/);
  });
  it('the newest entry is the version shown in the app, and entries count down without gaps', () => {
    expect(versions[0]).toBe(APP_VERSION);
    const n = (v: string) => Math.round(parseFloat(v) * 100);
    versions.forEach((v, i) => expect(n(v)).toBe(n(versions[0]) - i));
    expect(versions[versions.length - 1]).toBe('0.01');
  });
});
