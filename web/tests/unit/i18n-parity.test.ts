// P13: dictionary parity (every English key has Spanish with the same placeholders), legacy phrase coverage, and
// coverage of the validation/handler messages the server and contracts emit.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { shellStrings } from '../../src/i18n/shell';
import { legacyStrings } from '../../src/i18n/legacy';
import { fieldStrings } from '../../src/i18n/fields';

const root = resolve(__dirname, '../../src');
function walk(dir: string): string[] { return readdirSync(dir).flatMap(name => { const path = join(dir, name); return statSync(path).isDirectory() ? walk(path) : path.endsWith('.ts') || path.endsWith('.tsx') ? [path] : []; }); }
const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join(',');
async function featureDictionaries() {
  const files = walk(join(root, 'features')).filter(path => path.endsWith('/strings.ts'));
  return Promise.all(files.map(async path => ({ path, strings: (await import(path)).strings as { en: Record<string, string>; es: Record<string, string> } })));
}

describe('interface dictionaries', () => {
  it('have Spanish for every English key with identical placeholders', async () => {
    for (const { path, strings } of [{ path: 'shell', strings: shellStrings }, ...await featureDictionaries()]) {
      for (const [key, en] of Object.entries(strings.en)) {
        expect(strings.es[key], `${path}: ${key}`).toBeTypeOf('string');
        expect(placeholders(strings.es[key] ?? ''), `${path}: ${key} placeholders`).toBe(placeholders(en));
      }
      for (const key of Object.keys(strings.es)) expect(strings.en[key], `${path}: ${key} has no English`).toBeTypeOf('string');
    }
  });
  it('cover every legacy tx() phrase', () => {
    const phrases = new Set<string>();
    for (const path of walk(root)) { if (path.includes('/i18n/')) continue; for (const m of readFileSync(path, 'utf8').matchAll(/\btx\(\s*'((?:[^'\\]|\\.)*)'/g)) phrases.add(m[1].replace(/\\'/g, "'")); }
    const missing = [...phrases].filter(phrase => !(phrase in legacyStrings.es) && !(phrase in shellStrings.en));
    expect(missing).toEqual([]);
  });
  it('cover the validation and handler messages written in the contracts and server sources', () => {
    const sources = [resolve(__dirname, '../../../packages/contracts/src'), resolve(__dirname, '../../../server/src')];
    const messages = new Set<string>();
    for (const dir of sources) for (const path of walk(dir)) {
      const text = readFileSync(path, 'utf8');
      for (const m of text.matchAll(/\b(?:invalid|conflict|forbidden)\(\s*'((?:[^'\\]|\\.)*)'/g)) messages.add(m[1]);
      for (const m of text.matchAll(/new ApiError\(\s*\d+\s*,\s*'[A-Z_]+'\s*,\s*'((?:[^'\\]|\\.)*)'/g)) messages.add(m[1]);
      for (const m of text.matchAll(/(?:message|\.refine\([^,]+,)\s*:?\s*'((?:[^'\\]|\\.)*)'\s*[})]/g)) messages.add(m[1]);
    }
    const missing = [...messages].filter(message => /[a-z]/.test(message) && message.length > 8 && !message.includes('${') && !(message in fieldStrings));
    expect(missing).toEqual([]);
  });
});
