// P11: the maintained app skill, loaded once at startup, validated, and cut per role before it joins the Ask instructions.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ROLES, type Role } from '@pirata/contracts/permissions';
export const SKILL_VERSION = 'pirata-app/1';
const MAX_BYTES = 24 * 1024;
interface Section { roles: Set<Role>; text: string }
let cached: Section[] | null = null;
function parse(markdown: string): Section[] {
  const sections: Section[] = [];
  const parts = markdown.split(/<!--\s*roles:\s*([a-z ]+?)\s*-->/);
  // parts: [preamble, roles1, text1, roles2, text2, ...]
  for (let i = 1; i < parts.length; i += 2) {
    const roles = parts[i].trim().split(/\s+/).filter((role): role is Role => (ROLES as readonly string[]).includes(role));
    if (!roles.length) throw new Error('Skill section without a valid role tag.');
    sections.push({ roles: new Set(roles), text: parts[i + 1].trim() });
  }
  if (!sections.length) throw new Error('The skill file has no role-tagged sections.');
  return sections;
}
/** Reads and validates the skill file. Throws at startup when it is missing, too large or untagged, never at request time. */
export function loadSkill(path = fileURLToPath(new URL('./pirata-app.md', import.meta.url))): Section[] {
  if (cached) return cached;
  const text = readFileSync(path, 'utf8');
  if (Buffer.byteLength(text) > MAX_BYTES) throw new Error('The skill file exceeds 24 KB.');
  cached = parse(text);
  return cached;
}
export function resetSkillCache(): void { cached = null; }
/** The instructions one role may receive, with a two-line locale preamble. Sections the role may not read are absent, not hidden. */
export function skillFor(role: Role, locale: 'en' | 'es' = 'en', sections = loadSkill()): string {
  const preamble = locale === 'es'
    ? 'Responde en español claro y breve; los nombres de registros se citan tal cual.\nSi la persona escribe en inglés, responde en inglés.'
    : 'Answer in clear, brief English; quote record names exactly.\nIf the person writes in Spanish, answer in Spanish.';
  return [preamble, `App skill ${SKILL_VERSION}.`, ...sections.filter(section => section.roles.has(role)).map(section => section.text)].join('\n\n');
}
export function skillBytes(role: Role, locale: 'en' | 'es' = 'en'): number { return Buffer.byteLength(skillFor(role, locale)); }
