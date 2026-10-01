// P05: an uncertain save (network failure, lost response, 5xx) is retried with its original request identity, so the
// server's receipt replay prevents duplicates; a confirmed failure is never retried.
import { describe, expect, it, vi } from 'vitest';
import type { MutationRequest } from '@pirata/contracts/index';
import { createRetryableRunner, isUncertain } from '../../src/features/work/commands';
import { ServiceError } from '../../src/services/api';
const ok = { requestId: 'r', revision: 5, serverNow: 1, changed: true, result: { kind: 'test' } };
function harness() {
  const execute = vi.fn(), refresh = vi.fn().mockResolvedValue(undefined), onSaved = vi.fn();
  return { execute, refresh, onSaved, app: { service: { execute } as never, snapshot: { revision: 4 } as never, refresh, onSaved } };
}
const sent = (execute: ReturnType<typeof vi.fn>, index: number) => execute.mock.calls[index][0] as MutationRequest;
describe('retryable command runner', () => {
  it('classifies network failures, lost responses and server errors as uncertain, and 4xx answers as confirmed', () => {
    expect(isUncertain(new TypeError('Failed to fetch'))).toBe(true);
    expect(isUncertain(new ServiceError(0, { code: 'NETWORK', message: 'offline' }))).toBe(true);
    expect(isUncertain(new ServiceError(503, { code: 'STORAGE_UNAVAILABLE', message: 'down' }))).toBe(true);
    expect(isUncertain(new ServiceError(409, { code: 'REVISION_CONFLICT', message: 'moved' }))).toBe(false);
    expect(isUncertain(new ServiceError(400, { code: 'VALIDATION', message: 'bad' }))).toBe(false);
  });
  it('retries an uncertain save with the same requestId and baseRevision, then refreshes once', async () => {
    const { app, execute, refresh } = harness();
    execute.mockRejectedValueOnce(new ServiceError(0, { code: 'NETWORK', message: 'offline' })).mockResolvedValueOnce(ok);
    const runner = createRetryableRunner();
    expect(await runner.run(app, { type: 'timer.start', taskId: 't' })).toMatch(/not confirmed/i);
    expect(runner.pending()).toBe(true);
    expect(refresh).not.toHaveBeenCalled();
    expect(await runner.retry(app)).toBeNull();
    expect(execute).toHaveBeenCalledTimes(2);
    expect(sent(execute, 1).requestId).toBe(sent(execute, 0).requestId);
    expect(sent(execute, 1).baseRevision).toBe(4);
    expect(sent(execute, 1).command).toEqual(sent(execute, 0).command);
    expect(runner.pending()).toBe(false);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
  it('keeps the uncertain submission across repeated failures and a later new command starts a fresh identity', async () => {
    const { app, execute } = harness();
    execute.mockRejectedValue(new ServiceError(503, { code: 'STORAGE_UNAVAILABLE', message: 'down' }));
    const runner = createRetryableRunner();
    await runner.run(app, { type: 'timer.start', taskId: 't' });
    await runner.retry(app);
    expect(sent(execute, 1).requestId).toBe(sent(execute, 0).requestId);
    await runner.run(app, { type: 'timer.pause', expectedSessionId: 's' });
    expect(sent(execute, 2).requestId).not.toBe(sent(execute, 0).requestId);
  });
  it('does not keep a confirmed failure for retry', async () => {
    const { app, execute, refresh } = harness();
    execute.mockRejectedValueOnce(new ServiceError(409, { code: 'REVISION_CONFLICT', message: 'moved' }));
    const runner = createRetryableRunner();
    expect(await runner.run(app, { type: 'timer.pause', expectedSessionId: 's' })).toMatch(/another device/i);
    expect(runner.pending()).toBe(false);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(await runner.retry(app)).toBeNull();
    expect(execute).toHaveBeenCalledTimes(1);
  });
  it('treats a saved command whose refresh failed as saved, and says the list will catch up', async () => {
    const { app, execute, refresh, onSaved } = harness();
    execute.mockResolvedValueOnce(ok); refresh.mockRejectedValueOnce(new Error('offline'));
    const runner = createRetryableRunner();
    expect(await runner.run(app, { type: 'timer.pause', expectedSessionId: 's' })).toBeNull();
    expect(runner.pending()).toBe(false);
    expect(onSaved).toHaveBeenCalledWith(expect.stringMatching(/saved/i));
  });
});
