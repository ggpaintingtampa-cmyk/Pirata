// Update 2026-09-29 (P13): the owner-reviewed trade glossary. Saving bumps the glossary version and the cache epoch
// so cached translations are refreshed and clients re-key. Removal hides the row (no Trash entry: terms are re-added, not restored).
import type { HandlerMap } from '../../core/context.js';
import { conflict } from '../../core/errors.js';
export const handlers = {
  'glossary.save': (ctx, c) => {
    const rows = ctx.repo.list('translation_glossary');
    const duplicate = rows.find(row => row.en.toLowerCase() === c.en.toLowerCase() && row.id !== c.id);
    if (duplicate) conflict('This English term is already in the glossary.', 'GLOSSARY_DUPLICATE');
    if (c.id) {
      const existing = ctx.repo.require('translation_glossary', c.id);
      if (existing.en === c.en && existing.es === c.es && existing.note === c.note) return { changed: false, result: { kind: 'glossaryTerm', id: c.id } };
      ctx.repo.update('translation_glossary', c.id, { en: c.en, es: c.es, note: c.note, updatedAt: ctx.serverNow });
      ctx.repo.bumpTranslationEpoch(true);
      return { changed: true, result: { kind: 'glossaryTerm', id: c.id } };
    }
    const id = ctx.newId();
    ctx.repo.insert('translation_glossary', { id, createdAt: ctx.serverNow, updatedAt: ctx.serverNow, en: c.en, es: c.es, note: c.note, createdBy: ctx.userId });
    ctx.repo.bumpTranslationEpoch(true);
    return { changed: true, result: { kind: 'glossaryTerm', id } };
  },
  'glossary.remove': (ctx, c) => {
    ctx.repo.require('translation_glossary', c.id);
    ctx.repo.markDeleted('translation_glossary', c.id, { deletedAt: ctx.serverNow, deletedBy: ctx.userId, deletedWith: null });
    ctx.repo.bumpTranslationEpoch(true);
    return { changed: true, result: { kind: 'glossaryTerm', id: c.id } };
  },
} satisfies Pick<HandlerMap, 'glossary.save' | 'glossary.remove'>;
