// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import { HttpError } from '@asgard-js/core';
import type { UploadPlan } from './pick-upload';
import { useUploadQueue, type UploadQueue, type UploadQueueOptions, type UploadWrite } from './use-upload-queue';

/**
 * F-031 — the batch upload orchestrator.
 *
 * Two of these are the reasons this hook exists in the shape it does, and both are deadlocks the
 * prototype hit before the design settled:
 *
 * 1. Several files collide at once (concurrency is 3, so three is normal). If each opens its own
 *    dialog, every later resolver overwrites the previous one and the overwritten workers wait
 *    forever — the batch never finishes, with no error to point at.
 * 2. Cancelling while a worker awaits an answer. If the resolver lived in the component, nothing
 *    would answer it, and that worker would park forever — again, a batch that never settles.
 *
 * Neither is reachable by clicking: both need several files to collide inside the same tick. They are
 * asserted here through `onSettled`, which fires exactly once per batch and only when it truly ends.
 */

interface Deferred {
  promise: Promise<void>;
  resolve: () => void;
  reject: (error: unknown) => void;
}

function deferred(): Deferred {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

function planOf(...relPaths: string[]): UploadPlan {
  return {
    items: relPaths.map(relPath => ({ relPath, file: new File(['x'], relPath.split('/').pop() ?? relPath) })),
    emptyDirs: [],
    source: 'files',
  };
}

function planWithSizes(sizes: Record<string, number>): UploadPlan {
  return {
    items: Object.entries(sizes).map(([relPath, size]) => ({
      relPath,
      file: new File(['x'.repeat(size)], relPath),
    })),
    emptyDirs: [],
    source: 'files',
  };
}

function conflict(): HttpError {
  return new HttpError(409, 'Conflict');
}

function serverError(): HttpError {
  return new HttpError(503, 'Service Unavailable');
}

type QueueHarness = ReturnType<typeof renderHook<UploadQueue, unknown>> & { onSettled: Mock };

function setup(options: Partial<UploadQueueOptions> & { write: UploadWrite }): QueueHarness {
  const onSettled = vi.fn();

  const hook = renderHook(() =>
    useUploadQueue({
      onSettled,
      ...options,
    }),
  );

  return { ...hook, onSettled };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('F-031 R5 — the worker pool has a ceiling', () => {
  it('never exceeds the configured concurrency, and still finishes every file', async () => {
    const gates: Deferred[] = [];
    let inFlight = 0;
    let peak = 0;

    const write: UploadWrite = async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);

      const gate = deferred();
      gates.push(gate);

      try {
        await gate.promise;
      } finally {
        inFlight -= 1;
      }
    };

    const { result, onSettled } = setup({ write, concurrency: 3 });

    await act(async () => {
      result.current.start(planOf('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'));
    });

    // Three dispatched, six waiting — a `Promise.all` would show nine.
    expect(peak).toBe(3);

    while (gates.length > 0) {
      const gate = gates.shift();
      await act(async () => {
        gate?.resolve();
      });
    }

    expect(peak).toBe(3);
    expect(result.current.items.every(item => item.status === 'done')).toBe(true);
    expect(onSettled).toHaveBeenCalledTimes(1);
  });
});

describe('F-031 R6/R16 — backing off from a struggling server', () => {
  it('retries a 503, halves the ceiling, and marks only the terminal attempt as last', async () => {
    vi.useFakeTimers();

    const attempts: boolean[] = [];
    const write: UploadWrite = async (_relPath, _file, options) => {
      attempts.push(options.lastAttempt);

      if (attempts.length < 3) throw serverError();
    };

    const { result } = setup({ write, concurrency: 4 });

    await act(async () => {
      result.current.start(planOf('a'));
    });

    // 400ms then 800ms of back-off separate the three attempts.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(attempts).toEqual([false, false, false]);
    expect(result.current.items[0].status).toBe('done');
    // Halved twice by the two failures: 4 → 2 → 1.
    expect(result.current.limit).toBe(1);
  });

  it('gives up after four attempts, and says the last one was final', async () => {
    vi.useFakeTimers();

    const attempts: boolean[] = [];
    const write: UploadWrite = async (_relPath, _file, options) => {
      attempts.push(options.lastAttempt);
      throw serverError();
    };

    const { result } = setup({ write });

    await act(async () => {
      result.current.start(planOf('a'));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    // Four attempts, and only the fourth is flagged — which is the one a failure counter should see.
    expect(attempts).toEqual([false, false, false, true]);
    expect(result.current.items[0].status).toBe('failed');
    expect(result.current.items[0].reason).toEqual({
      code: 'http',
      status: 503,
      message: 'HTTP 503: Service Unavailable',
    });
  });

  it('does not retry a 4xx that is not a collision — it would just fail again', async () => {
    const write = vi.fn<Parameters<UploadWrite>, ReturnType<UploadWrite>>(() =>
      Promise.reject(new HttpError(403, 'Forbidden')),
    );

    const { result } = setup({ write });

    await act(async () => {
      result.current.start(planOf('a'));
    });

    expect(write).toHaveBeenCalledTimes(1);
    expect(result.current.items[0].status).toBe('failed');
  });
});

describe('F-031 R10 — the size cap is checked before dispatch', () => {
  it('fails an oversized file without spending a request, and uploads the rest', async () => {
    const write = vi.fn<Parameters<UploadWrite>, ReturnType<UploadWrite>>(() => Promise.resolve());

    const { result } = setup({ write, maxBytes: 10 });

    await act(async () => {
      result.current.start(planWithSizes({ 'big.bin': 40, 'small.txt': 4 }));
    });

    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0][0]).toBe('small.txt');
    expect(result.current.items[0]).toMatchObject({
      status: 'failed',
      reason: { code: 'too-large', maxBytes: 10, size: 40 },
    });
  });
});

describe('F-031 R9/R14 — collisions', () => {
  it('asks one at a time when three files collide together (deadlock 1)', async () => {
    const write: UploadWrite = async (relPath, _file, options) => {
      if (options.createOnly) throw conflict();

      // The overwrite retry succeeds.
      expect(relPath).toBeTruthy();
    };

    const { result, onSettled } = setup({ write, concurrency: 3 });

    await act(async () => {
      result.current.start(planOf('a', 'b', 'c'));
    });

    // All three collided, but only one question is open.
    expect(result.current.conflict).not.toBeNull();

    const asked: string[] = [];

    for (let i = 0; i < 3; i += 1) {
      const open = result.current.conflict;
      expect(open).not.toBeNull();
      asked.push(open?.relPath ?? '');

      await act(async () => {
        result.current.answerConflict({ choice: 'overwrite', applyToAll: false });
      });
    }

    expect(asked.sort()).toEqual(['a', 'b', 'c']);
    expect(result.current.conflict).toBeNull();
    expect(result.current.items.every(item => item.status === 'done')).toBe(true);
    // The batch actually ended — which is exactly what the overwritten-resolver bug prevented.
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it('settles the batch when cancelled while awaiting an answer (deadlock 2)', async () => {
    const write: UploadWrite = async (_relPath, _file, options) => {
      if (options.createOnly) throw conflict();
    };

    const { result, onSettled } = setup({ write, concurrency: 3 });

    await act(async () => {
      result.current.start(planOf('a', 'b', 'c'));
    });

    expect(result.current.conflict).not.toBeNull();

    await act(async () => {
      result.current.cancel();
    });

    // Nobody answered the open question; the queue released that worker itself.
    expect(result.current.running).toBe(false);
    expect(result.current.conflict).toBeNull();
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it('"keep both" renames and still refuses to overwrite', async () => {
    const seen: Array<{ relPath: string; createOnly: boolean }> = [];
    const write: UploadWrite = async (relPath, _file, options) => {
      seen.push({ relPath, createOnly: options.createOnly });

      if (relPath === 'report.txt') throw conflict();
    };

    const { result } = setup({ write, concurrency: 1 });

    await act(async () => {
      result.current.start(planOf('report.txt'));
    });
    await act(async () => {
      result.current.answerConflict({ choice: 'keep-both', applyToAll: false });
    });

    expect(seen).toEqual([
      { relPath: 'report.txt', createOnly: true },
      // Renamed — and still createOnly. A new name is not permission to overwrite what sits there.
      { relPath: 'report (2).txt', createOnly: true },
    ]);
    expect(result.current.items[0]).toMatchObject({ status: 'done', writtenAs: 'report (2).txt' });
  });

  it('"skip" marks the item skipped rather than failed', async () => {
    const write: UploadWrite = async () => {
      throw conflict();
    };

    const { result } = setup({ write, concurrency: 1 });

    await act(async () => {
      result.current.start(planOf('a'));
    });
    await act(async () => {
      result.current.answerConflict({ choice: 'skip', applyToAll: false });
    });

    expect(result.current.items[0]).toMatchObject({ status: 'skipped', reason: { code: 'exists-skipped' } });
  });

  it('applies one answer to the rest instead of asking two hundred times', async () => {
    let asks = 0;
    const write: UploadWrite = async (_relPath, _file, options) => {
      if (options.createOnly) throw conflict();
    };

    const { result } = setup({ write, concurrency: 1 });

    await act(async () => {
      result.current.start(planOf('a', 'b', 'c', 'd'));
    });

    asks += 1;
    await act(async () => {
      result.current.answerConflict({ choice: 'overwrite', applyToAll: true });
    });

    expect(asks).toBe(1);
    expect(result.current.conflict).toBeNull();
    expect(result.current.items.every(item => item.status === 'done')).toBe(true);
  });
});

describe('F-031 R8 — cancelling', () => {
  it('stops dispatching and marks the untouched items cancelled', async () => {
    const gates: Deferred[] = [];
    const write: UploadWrite = () => {
      const gate = deferred();
      gates.push(gate);

      return gate.promise;
    };

    const { result, onSettled } = setup({ write, concurrency: 1 });

    await act(async () => {
      result.current.start(planOf('a', 'b', 'c'));
    });

    expect(gates).toHaveLength(1);

    await act(async () => {
      result.current.cancel();
      gates[0].resolve();
    });

    // No further dispatch after the cancel.
    expect(gates).toHaveLength(1);
    expect(result.current.cancelled).toBe(true);
    expect(result.current.items.slice(1).every(item => item.status === 'skipped')).toBe(true);
    expect(result.current.items[1].reason).toEqual({ code: 'cancelled' });
    expect(onSettled).toHaveBeenCalledTimes(1);
  });
});

describe('F-031 R8 — cancelling during a back-off', () => {
  it('settles at once instead of waiting the back-off out', async () => {
    vi.useFakeTimers();

    const write: UploadWrite = async () => {
      throw serverError();
    };

    const { result, onSettled } = setup({ write, concurrency: 1 });

    await act(async () => {
      result.current.start(planOf('a'));
    });

    // Partway into the first 400ms back-off.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(onSettled).not.toHaveBeenCalled();

    await act(async () => {
      result.current.cancel();
    });

    // No timers advanced past this point: the armed back-off was cleared rather than waited out.
    expect(result.current.running).toBe(false);
    expect(onSettled).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('F-031 R7/R11 — progress and settling', () => {
  it('refreshes once for the whole batch, not once per file', async () => {
    const write: UploadWrite = () => Promise.resolve();
    const { result, onSettled } = setup({ write, concurrency: 3 });

    await act(async () => {
      result.current.start(planOf('a', 'b', 'c', 'd', 'e'));
    });

    expect(result.current.items).toHaveLength(5);
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it('retries only the failed items, and never one that was too large', async () => {
    const written: string[] = [];
    let failFirst = true;
    const write: UploadWrite = async relPath => {
      written.push(relPath);

      if (relPath === 'flaky.txt' && failFirst) throw new HttpError(403, 'Forbidden');
    };

    const { result } = setup({ write, maxBytes: 10, concurrency: 1 });

    await act(async () => {
      result.current.start(planWithSizes({ 'ok.txt': 1, 'flaky.txt': 1, 'big.bin': 40 }));
    });

    expect(written).toEqual(['ok.txt', 'flaky.txt']);

    failFirst = false;
    written.length = 0;

    await act(async () => {
      result.current.retryFailed();
    });

    // Only the recoverable failure went again: not the success, not the oversized file.
    expect(written).toEqual(['flaky.txt']);
    expect(result.current.items.find(item => item.relPath === 'big.bin')?.status).toBe('failed');
    expect(result.current.items.find(item => item.relPath === 'flaky.txt')?.status).toBe('done');
  });

  it('creates empty directories before any file lands', async () => {
    const order: string[] = [];
    const write: UploadWrite = async relPath => {
      order.push(`write:${relPath}`);
    };

    const mkdir = async (relPath: string): Promise<void> => {
      order.push(`mkdir:${relPath}`);
    };

    const { result } = setup({ write, mkdir, concurrency: 3 });

    await act(async () => {
      result.current.start({ items: planOf('notes/a.md').items, emptyDirs: ['notes/empty'], source: 'drop' });
    });

    expect(order).toEqual(['mkdir:notes/empty', 'write:notes/a.md']);
  });

  it('does not let a failed mkdir stop the files', async () => {
    const written: string[] = [];
    const write: UploadWrite = async relPath => {
      written.push(relPath);
    };

    const mkdir = (): Promise<void> => Promise.reject(new HttpError(500, 'Internal Server Error'));

    const { result } = setup({ write, mkdir });

    await act(async () => {
      result.current.start({ items: planOf('a.md').items, emptyDirs: ['nope'], source: 'drop' });
    });

    expect(written).toEqual(['a.md']);
    expect(result.current.items[0].status).toBe('done');
  });

  it('will not dismiss a batch that is still running', async () => {
    const gates: Deferred[] = [];
    const write: UploadWrite = () => {
      const gate = deferred();
      gates.push(gate);

      return gate.promise;
    };

    const { result } = setup({ write, concurrency: 1 });

    await act(async () => {
      result.current.start(planOf('a'));
    });
    await act(async () => {
      result.current.dismiss();
    });

    expect(result.current.items).toHaveLength(1);

    await act(async () => {
      gates[0].resolve();
    });
    await act(async () => {
      result.current.dismiss();
    });

    expect(result.current.items).toHaveLength(0);
  });
});
