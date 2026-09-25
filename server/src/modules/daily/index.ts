// Chunk A owns this file. Foundation registered every command as a stub so the handler map stays exhaustive.
import type { HandlerMap } from '../../core/context.js';
import { notImplemented } from '../../core/errors.js';
export const handlers={
  'task.reorder':()=>notImplemented(),
  'dayList.replace':()=>notImplemented(),
  'dayList.take':()=>notImplemented(),
  'dayList.release':()=>notImplemented(),
  'dayList.setPresence':()=>notImplemented(),
  'question.ask':()=>notImplemented(),
  'question.answer':()=>notImplemented(),
  'taskTemplate.saveTree':()=>notImplemented(),
  'taskTemplate.applyTree':()=>notImplemented(),
  'projectTemplate.save':()=>notImplemented(),
  'projectTemplate.apply':()=>notImplemented(),
  'projectTemplate.fromProject':()=>notImplemented(),
} satisfies Pick<HandlerMap,'task.reorder'|'dayList.replace'|'dayList.take'|'dayList.release'|'dayList.setPresence'|'question.ask'|'question.answer'|'taskTemplate.saveTree'|'taskTemplate.applyTree'|'projectTemplate.save'|'projectTemplate.apply'|'projectTemplate.fromProject'>;
