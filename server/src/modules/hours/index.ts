// Chunk B owns this file. Foundation registered every command as a stub so the handler map stays exhaustive.
import type { HandlerMap } from '../../core/context.js';
import { notImplemented } from '../../core/errors.js';
export const handlers={
  'shift.submit':()=>notImplemented(),
  'shift.enter':()=>notImplemented(),
  'shift.update':()=>notImplemented(),
  'shift.approve':()=>notImplemented(),
  'shift.reject':()=>notImplemented(),
  'shift.remove':()=>notImplemented(),
  'payRate.set':()=>notImplemented(),
  'payRate.remove':()=>notImplemented(),
  'dayNote.save':()=>notImplemented(),
} satisfies Pick<HandlerMap,'shift.submit'|'shift.enter'|'shift.update'|'shift.approve'|'shift.reject'|'shift.remove'|'payRate.set'|'payRate.remove'|'dayNote.save'>;
