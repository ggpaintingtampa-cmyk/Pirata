// P13: server error codes rendered in the viewer's language. The server keeps its English messages; the client maps codes
// and falls back to the server text for anything not listed. Field-level messages go through fields.ts.
import { ServiceError } from '../services/api';
import { translate, type Locale } from './index';
import { fieldMessage } from './fields';
export const ERROR_CODES = ['REVISION_CONFLICT', 'IDEMPOTENCY_CONFLICT', 'FORBIDDEN', 'NOT_FOUND', 'INVALID_INPUT', 'CONFLICT', 'SCHEDULE_OVERLAP', 'TIMER_CONFLICT', 'TEAM_TIMER_ACTIVE', 'TASK_NOT_OPEN', 'DAILY_GOAL_ACTIVE', 'CLOCK_CONFLICT', 'OBJECTIVE_DATE_CONFLICT', 'TOOL_OUT', 'TEAM_LIMIT', 'INVALID_MEMBER', 'ASK_DISABLED', 'ASK_LIMIT', 'ASK_PROVIDER', 'ASK_PENDING', 'ALLOWANCE_REQUIRED', 'CLARIFY', 'CSRF_REJECTED', 'UNAUTHENTICATED', 'INVALID_CREDENTIALS', 'RATE_LIMITED', 'STORAGE_UNAVAILABLE', 'TOO_LARGE', 'NETWORK_ERROR', 'UNAVAILABLE', 'KEY_PERMISSIONS', 'IMPORT_CONFLICT', 'CLOCK_BACKWARD', 'NOT_IMPLEMENTED', 'GLOSSARY_DUPLICATE', 'TRANSLATION_UNAVAILABLE', 'BULK_PREVIEW_STALE', 'ORDER_STALE', 'TOKEN_REVOKED'] as const;
/** The message to show for a failed request. Unknown codes keep the server's text; known codes use `shell.error.<CODE>`. */
export function errorMessage(locale: Locale, error: unknown): string {
  if (error instanceof ServiceError) {
    const key = 'shell.error.' + error.code, text = translate(locale, key);
    if (text !== key) return text;
    return locale === 'es' ? fieldMessage(locale, error.message) : error.message;
  }
  if (error instanceof Error) return locale === 'es' ? fieldMessage(locale, error.message) : error.message;
  return translate(locale, 'shell.error.UNAVAILABLE');
}
/** Field-level problems from the server (`fields`) or from client validation, keyed by the English text the code emits. */
export function fieldMessages(locale: Locale, fields: Record<string, string> | undefined): Record<string, string> {
  return Object.fromEntries(Object.entries(fields ?? {}).map(([name, message]) => [name, fieldMessage(locale, message)]));
}
