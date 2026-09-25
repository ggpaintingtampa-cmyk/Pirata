// Chunk C owns this file. Foundation registered every command as a stub so the handler map stays exhaustive.
import type { HandlerMap } from '../../core/context.js';
import { notImplemented } from '../../core/errors.js';
export const handlers={
  'projectFact.save':()=>notImplemented(),
  'projectFact.remove':()=>notImplemented(),
  'attachment.tag':()=>notImplemented(),
  'attachment.comment':()=>notImplemented(),
} satisfies Pick<HandlerMap,'projectFact.save'|'projectFact.remove'|'attachment.tag'|'attachment.comment'>;
