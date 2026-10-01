import { useState } from 'react';
import type { BusinessCommand } from '@pirata/contracts/index';
import type { ModuleProps } from '../../services/moduleProps';
import { createMutation, createSubmission, ServiceError } from '../../services/api';
import { currentLocaleValue, tx } from '../../i18n';
import { errorMessage } from '../../i18n/errors';
type Submission = ReturnType<typeof createSubmission>;
type Runner = Pick<ModuleProps, 'service' | 'snapshot' | 'refresh' | 'onSaved'>;
/** A network failure, a lost response or a 5xx leaves the save uncertain; the same envelope may be resent safely (the server replays receipts by request id). */
export const isUncertain = (cause: unknown): boolean => !(cause instanceof ServiceError) || cause.status === 0 || cause.status >= 500;
/** P05: the save is acknowledged; a failed follow-up refresh is announced, never surfaced as a save failure. */
async function settle(app: Runner): Promise<null> { try { await app.refresh(); } catch { app.onSaved(tx('shell.savedReloadPending')); } return null; }
async function describe(app: Runner, cause: unknown): Promise<string> {
  if (cause instanceof ServiceError) {
    if (cause.code === 'REVISION_CONFLICT') { try { await app.refresh(); } catch { /* keep the message */ } return tx('shell.command.conflict'); }
    return errorMessage(currentLocaleValue(), cause);
  }
  return tx('shell.command.failed');
}
/** Run one command for an inline control (toggle, take, reorder). Resolves to null on success or a message to show. */
export async function runCommand(app: ModuleProps, command: BusinessCommand): Promise<string | null> {
  try { await createSubmission(app.service, createMutation(command, app.snapshot.revision)).submit(); return settle(app); }
  catch (cause) { return describe(app, cause); }
}
/** P05: keeps the last uncertain submission so it can be retried with its original request identity; confirmed failures are never retried.
 *  The module props are passed at call time, so a retry uses the live service and a new command uses the current snapshot revision. */
export function createRetryableRunner() {
  let last: Submission | null = null;
  const perform = async (app: Runner, submission: Submission): Promise<string | null> => {
    try { await submission.submit(); last = null; return settle(app); }
    catch (cause) {
      if (isUncertain(cause)) { last = submission; return tx('shell.command.unconfirmed'); }
      last = null; return describe(app, cause);
    }
  };
  return {
    run: (app: Runner, command: BusinessCommand) => perform(app, createSubmission(app.service, createMutation(command, app.snapshot.revision))),
    retry: (app: Runner) => last ? perform(app, last) : Promise.resolve<string | null>(null),
    pending: () => last !== null,
    pendingRequestId: () => last?.request.requestId ?? null,
  };
}
export function useRetryableCommand(app: ModuleProps): { run(command: BusinessCommand): Promise<string | null>; retry(): Promise<string | null>; pending: boolean } {
  const [runner] = useState(createRetryableRunner);
  const [pending, setPending] = useState(false);
  const track = async (work: Promise<string | null>) => { const message = await work; setPending(runner.pending()); return message; };
  return { run: command => track(runner.run(app, command)), retry: () => track(runner.retry(app)), pending };
}
