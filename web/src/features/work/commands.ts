import type { BusinessCommand } from '@pirata/contracts/index';
import type { ModuleProps } from '../../services/moduleProps';
import { createMutation, createSubmission, ServiceError } from '../../services/api';
/** Run one command for an inline control (toggle, take, reorder). Resolves to null on success or a message to show. */
export async function runCommand(app: ModuleProps, command: BusinessCommand): Promise<string | null> {
  try { await createSubmission(app.service, createMutation(command, app.snapshot.revision)).submit(); await app.refresh(); return null; }
  catch (cause) {
    if (cause instanceof ServiceError) {
      if (cause.code === 'REVISION_CONFLICT') { try { await app.refresh(); } catch { /* keep the message */ } return 'Records changed on another device. Try again.'; }
      return cause.message;
    }
    return 'Could not save. Check the connection and try again.';
  }
}
