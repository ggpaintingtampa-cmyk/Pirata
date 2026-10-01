// P13 §13.4: search in the viewer's language over originals and cached translations. One result per record.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { localeSchema, type SearchResponse, type SearchResult } from '@pirata/contracts/translation';
import type { Sqlite } from '../db/database.js';
import { requireSession } from '../auth/sessions.js';
import { readSnapshot } from '../core/snapshot.js';
import { capabilities } from '../modules/index.js';
import { allCached, hashText } from '../translation/cache.js';
import { listRecords, readFields, recordProject, recordTitle } from '../translation/fields.js';

const snippet = (text: string, query: string) => { const at = text.toLowerCase().indexOf(query); const start = Math.max(0, at - 40); return (start ? '…' : '') + text.slice(start, start + 120) + (text.length > start + 120 ? '…' : ''); };
export function registerSearch(app: FastifyInstance, { db, now }: { db: Sqlite; now: () => number }): void {
  app.get('/api/v1/search', async req => {
    const s = requireSession(db, req, now());
    const { q, locale } = z.object({ q: z.string().trim().min(2).max(200), locale: localeSchema.default('en') }).parse(req.query ?? {});
    const query = q.toLowerCase(), snapshot = readSnapshot(db, s.owner_id, capabilities, now(), s.user_id, s.role);
    const cached = allCached(db, s.owner_id, locale);
    const results: SearchResult[] = [];
    let fields = 0, translatedFields = 0;
    for (const record of listRecords(snapshot)) {
      const values = readFields(snapshot, record.kind, record.id) ?? {};
      let hit: SearchResult | undefined;
      for (const [field, original] of Object.entries(values)) {
        if (!original.trim()) continue;
        fields++;
        const row = cached.get(`${record.kind}|${record.id}|${field}`);
        const translation = row && row.sourceHash === hashText(original) ? row.text : undefined;
        if (translation !== undefined) translatedFields++;
        if (hit) continue;
        if (translation !== undefined && translation.toLowerCase().includes(query)) hit = { kind: record.kind, id: record.id, field, title: recordTitle(snapshot, record.kind, record.id), snippet: snippet(translation, query), matchedIn: 'translation', projectId: recordProject(snapshot, record.kind, record.id) };
        else if (original.toLowerCase().includes(query)) hit = { kind: record.kind, id: record.id, field, title: recordTitle(snapshot, record.kind, record.id), snippet: snippet(original, query), matchedIn: 'original', projectId: recordProject(snapshot, record.kind, record.id) };
      }
      if (hit) { results.push(hit); if (results.length >= 100) break; }
    }
    const response: SearchResponse = { query: q, locale, results, translatedCoverage: !fields || !translatedFields ? 'none' : translatedFields >= fields ? 'full' : 'partial' };
    return response;
  });
}
