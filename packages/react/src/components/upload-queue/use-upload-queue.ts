import { useCallback, useEffect, useRef, useState } from 'react';
import { isHttpError } from '@asgard-js/core';
import { dedupeName, type UploadPlan, type UploadPlanSource } from './pick-upload';

/**
 * The batch upload orchestrator — headless, and carrying **no** sandbox or volume concept, because
 * F-031 owns it and F-025 consumes the same copy for the SourceSet explorer (2026-08-11 unified
 * rendering decision). Anything sandbox-shaped leaking in here would force both consumers to
 * understand it, so the per-file cap, the concurrency ceiling and every piece of copy are injected.
 *
 * Why it needs to exist at all: there is no batch endpoint. Every relay in the chain is
 * `c.FormFile("file")` — one file per request — and there is no archive-expanding endpoint either,
 * so 240 files is 240 requests. On the sandbox path each of those makes the edge server re-read the
 * Sandbox CR, open a fresh gRPC connection, and `io.ReadAll` the whole file into memory. Firing them
 * all at once is not merely slow; it takes the edge server down.
 *
 * Four decisions follow from that:
 *
 * 1. **A worker pool, never `Promise.all`.** There is a hard ceiling on requests in flight.
 * 2. **AIMD.** A `429` / `5xx` halves the ceiling; four consecutive successes add one slot back.
 *    A fixed concurrency keeps hammering a server that is already struggling.
 * 3. **No pre-emptive mkdir.** Both write paths create parent directories, so `a/b/c.txt` is written
 *    directly. Only genuinely empty directories need one — and only the drag path can see those.
 * 4. **Collisions are asked about, not guessed.** Writes go out with `createOnly`, and a `409` stops
 *    to ask. The backend default is a silent overwrite, and a folder upload collides far too often
 *    for that to be acceptable.
 */

export type UploadStatus = 'queued' | 'uploading' | 'done' | 'failed' | 'skipped';

/**
 * Why an item did not upload — **a structured code, never a translated string**. This hook is shared
 * by two explorers with separate copy (F-025 mandates its own `sourceSetExplorer.*` namespace rather
 * than reusing `fileExplorer.*`) across three locales, so it cannot embed any one of them.
 * Translation belongs to the UI layer; see `UploadLabels`.
 */
export type UploadReason =
  | { code: 'too-large'; maxBytes: number; size: number }
  | { code: 'exists-skipped' }
  | { code: 'cancelled' }
  | { code: 'http'; status?: number; message: string };

export interface UploadItem {
  id: string;
  /** Relative to the destination directory; may span several levels. */
  relPath: string;
  size: number;
  status: UploadStatus;
  reason?: UploadReason;
  /** Where it actually landed — differs from `relPath` when "keep both" renamed it. */
  writtenAs?: string;
}

export type UploadConflictChoice = 'skip' | 'overwrite' | 'keep-both';

export interface UploadConflictAsk {
  relPath: string;
  /** How many items are still undispatched — the "apply to the remaining N" count. */
  remaining: number;
}

export interface UploadConflictAnswer {
  choice: UploadConflictChoice;
  /** Reuse this choice for every later collision in the batch. */
  applyToAll: boolean;
}

/** Writes one file. Must reject on a collision when `createOnly`, recognizably (in practice: 409). */
export type UploadWrite = (
  relPath: string,
  file: File,
  options: {
    createOnly: boolean;
    signal: AbortSignal;
    /**
     * This is the last attempt the queue will make for this file — it retries no further, whatever
     * happens.
     *
     * It exists for layers that count failures to decide something is broken. The sandbox provider
     * treats three consecutive server errors as "this sandbox is gone" and drops it from the picker,
     * while the back-off here deliberately retries exactly those errors; counting every attempt would
     * evict a live sandbox for merely pushing back. Counting only the terminal one keeps both: a dead
     * sandbox still evicts after three failed files.
     */
    lastAttempt: boolean;
  },
) => Promise<void>;

export interface UploadQueueOptions {
  write: UploadWrite;
  /** Creates an empty directory (`mkdir -p` semantics). Omitted → empty directories are skipped. */
  mkdir?: (relPath: string, options: { signal: AbortSignal }) => Promise<void>;
  /**
   * Per-file cap in bytes; `undefined` means no cap. The sandbox path has one (`FileWriteMaxBytes`)
   * and the SourceSet volume, which streams in chunks, does not — so this is a parameter rather
   * than a constant. Oversized files fail before a request is spent collecting a `400`.
   */
  maxBytes?: number;
  /** Ceiling on requests in flight (the AIMD upper bound). */
  concurrency?: number;
  /** Fired **once** when the batch settles, cancellation included — where a refresh belongs. */
  onSettled?: () => void;
}

const DEFAULT_CONCURRENCY = 3;
const MAX_ATTEMPTS = 4;
const BASE_BACKOFF_MS = 400;
const SUCCESSES_PER_SLOT = 4;

/** `429` / `5xx` / a dropped connection are worth retrying; any other `4xx` would just fail again. */
export function isRetryableUploadError(error: unknown): boolean {
  if (isHttpError(error)) return error.status === 429 || error.status >= 500;

  // `fetch` reports a network-layer failure as a TypeError. An abort arrives as a DOMException and
  // is handled by the abort check ahead of this, so it never reaches here.
  return error instanceof TypeError;
}

/** `409` — something already occupies the destination. */
export function isUploadConflictError(error: unknown): boolean {
  return isHttpError(error) && error.status === 409;
}

function statusOf(error: unknown): number | undefined {
  return isHttpError(error) ? error.status : undefined;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? '');
}

/**
 * Real back-off between retries — a deliberate delay, not a simulated one.
 *
 * Cleared when the batch is aborted: cancelling 240 files mid-back-off would otherwise leave one armed
 * timer per waiting worker, each firing up to 1.6s after the user already gave up (§1.5).
 */
function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise(resolve => {
    if (signal.aborted) {
      resolve();

      return;
    }

    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);

    function onAbort(): void {
      clearTimeout(timer);
      resolve();
    }

    signal.addEventListener('abort', onAbort, { once: true });
  });
}

export interface UploadQueueState {
  items: UploadItem[];
  /** The batch is still going. */
  running: boolean;
  /** The user cancelled; anything in flight was aborted. */
  cancelled: boolean;
  /** The ceiling AIMD is currently honoring. Below `ceiling` means the server is struggling. */
  limit: number;
  /** The configured upper bound, for "slowed to 1 of 3". */
  ceiling: number;
  source: UploadPlanSource | null;
  /** A collision awaiting an answer; non-null means the UI should be asking. */
  conflict: UploadConflictAsk | null;
}

export interface UploadQueue extends UploadQueueState {
  start: (plan: UploadPlan) => void;
  /** Answers the open `conflict`. `null` cancels the whole batch. */
  answerConflict: (answer: UploadConflictAnswer | null) => void;
  cancel: () => void;
  /** Re-sends only the failed items. */
  retryFailed: () => void;
  /** Clears the panel; allowed only once the batch has settled. */
  dismiss: () => void;
}

interface QueueEntry {
  item: UploadItem;
  file: File;
}

export function useUploadQueue(options: UploadQueueOptions): UploadQueue {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const ceiling = options.concurrency ?? DEFAULT_CONCURRENCY;

  const [items, setItems] = useState<UploadItem[]>([]);
  // Mirrors `items` so `retryFailed` can read the current list without doing it inside a state updater.
  const itemsRef = useRef<UploadItem[]>([]);
  itemsRef.current = items;

  const [running, setRunning] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const [limit, setLimit] = useState(ceiling);
  const [source, setSource] = useState<UploadPlanSource | null>(null);
  const [conflict, setConflict] = useState<UploadConflictAsk | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  /** id → File, kept for the length of the batch so a retry can re-send the original. */
  const filesRef = useRef<Map<string, File>>(new Map());
  /** The remembered "apply to all" choice; discarded when the batch settles. */
  const blanketRef = useRef<UploadConflictChoice | null>(null);
  /** The worker currently awaiting an answer — cancellation has to release it. */
  const resolverRef = useRef<((answer: UploadConflictAnswer | null) => void) | null>(null);
  /**
   * Serializes the questions. At concurrency 3 three files can collide at once; asking all three
   * together would let each later resolver overwrite the previous one, leaving those workers waiting
   * forever and the batch never finishing. One question at a time.
   */
  const askChainRef = useRef<Promise<unknown>>(Promise.resolve());
  /** Monotonic batch id, so item ids stay unique without depending on the clock alone. */
  const batchSeqRef = useRef(0);

  const patch = useCallback((id: string, next: Partial<UploadItem>): void => {
    setItems(prev => prev.map(item => (item.id === id ? { ...item, ...next } : item)));
  }, []);

  // An unmount mid-batch would otherwise leave the in-flight requests running and any worker waiting
  // on a collision answer parked forever, since nothing is left to answer it (§1.5).
  useEffect(() => {
    return (): void => {
      abortRef.current?.abort();
      resolverRef.current?.(null);
      resolverRef.current = null;
    };
  }, []);

  /** Queue one collision question. An existing "apply to all" answers it without asking again. */
  const askConflict = useCallback(
    (ask: UploadConflictAsk, aborted: () => boolean): Promise<UploadConflictChoice | null> => {
      const segment = askChainRef.current.then(async () => {
        if (blanketRef.current) return blanketRef.current;

        if (aborted()) return null;

        setConflict(ask);

        const answer = await new Promise<UploadConflictAnswer | null>(resolve => {
          resolverRef.current = resolve;
        });

        resolverRef.current = null;
        setConflict(null);

        if (!answer) return null;

        if (answer.applyToAll) blanketRef.current = answer.choice;

        return answer.choice;
      });

      askChainRef.current = segment.catch(() => undefined);

      return segment;
    },
    [],
  );

  const answerConflict = useCallback((answer: UploadConflictAnswer | null): void => {
    resolverRef.current?.(answer);
    resolverRef.current = null;
  }, []);

  const runBatch = useCallback(
    async (queue: QueueEntry[], emptyDirs: string[]): Promise<void> => {
      const { write, mkdir, maxBytes, onSettled } = optionsRef.current;
      const ceilingNow = optionsRef.current.concurrency ?? DEFAULT_CONCURRENCY;
      const controller = new AbortController();

      abortRef.current = controller;
      blanketRef.current = null;

      setRunning(true);
      setCancelled(false);
      setLimit(ceilingNow);

      let live = ceilingNow;
      let okStreak = 0;

      const decrease = (): void => {
        live = Math.max(1, Math.floor(live / 2));
        okStreak = 0;
        setLimit(live);
      };

      const increase = (): void => {
        okStreak += 1;

        if (okStreak >= SUCCESSES_PER_SLOT && live < ceilingNow) {
          live += 1;
          okStreak = 0;
          setLimit(live);
        }
      };

      // Empty directories go first so the shape is complete before files start landing, rather than
      // a level appearing partway through the batch.
      for (const dir of emptyDirs) {
        if (controller.signal.aborted) break;

        try {
          await mkdir?.(dir, { signal: controller.signal });
        } catch {
          // One directory failing must not stop the files; it simply will not be there on refresh.
        }
      }

      let cursor = 0;
      let inFlight = 0;
      const undispatched = (): number => queue.length - cursor;

      /** One file end to end: pre-flight → send → (ask on collision / back off if retryable) → settle. */
      const runOne = async (entry: QueueEntry): Promise<void> => {
        const { item, file } = entry;

        if (controller.signal.aborted) return;

        if (maxBytes !== undefined && file.size > maxBytes) {
          patch(item.id, { status: 'failed', reason: { code: 'too-large', maxBytes, size: file.size } });

          return;
        }

        patch(item.id, { status: 'uploading' });

        let target = item.relPath;
        let createOnly = true;
        /** Only a transient network/server failure spends this; resolving collisions must not. */
        let retries = 0;
        /** Suffix counter for "keep both". */
        let duplicate = 1;

        for (;;) {
          try {
            await write(target, file, {
              createOnly,
              signal: controller.signal,
              lastAttempt: retries >= MAX_ATTEMPTS - 1,
            });
            increase();
            patch(item.id, { status: 'done', writtenAs: target });

            return;
          } catch (error) {
            if (controller.signal.aborted) return;

            if (isUploadConflictError(error) && createOnly) {
              const choice = await askConflict(
                { relPath: target, remaining: undispatched() },
                () => controller.signal.aborted,
              );

              if (choice === null) {
                controller.abort();
                setCancelled(true);

                return;
              }

              if (choice === 'skip') {
                patch(item.id, { status: 'skipped', reason: { code: 'exists-skipped' } });

                return;
              }

              if (choice === 'overwrite') {
                createOnly = false;

                continue;
              }

              // Keep both: try a name that does not collide — and **stay** createOnly. Renaming is
              // not permission to overwrite whatever happens to sit at the new name either.
              duplicate += 1;
              target = dedupeName(item.relPath, duplicate);

              continue;
            }

            if (isRetryableUploadError(error) && retries < MAX_ATTEMPTS - 1) {
              retries += 1;
              decrease();
              await delay(BASE_BACKOFF_MS * 2 ** (retries - 1), controller.signal);

              continue;
            }

            patch(item.id, {
              status: 'failed',
              reason: { code: 'http', status: statusOf(error), message: messageOf(error) },
            });

            return;
          }
        }
      };

      await new Promise<void>(resolve => {
        // Declared once rather than per iteration: every worker shares the same `inFlight` counter, and
        // refilling the pool as each one lands is the whole mechanism.
        const onOneSettled = (): void => {
          inFlight -= 1;
          pump();
        };

        function pump(): void {
          if (controller.signal.aborted) {
            if (inFlight === 0) resolve();

            return;
          }

          while (inFlight < live && cursor < queue.length) {
            const entry = queue[cursor++];

            inFlight += 1;
            void runOne(entry).finally(onOneSettled);
          }

          if (inFlight === 0 && cursor >= queue.length) resolve();
        }

        pump();
      });

      // Anything still queued when the batch was cancelled has to say so — leaving it as "queued"
      // reads as "still coming".
      if (controller.signal.aborted) {
        setItems(prev =>
          prev.map(item =>
            item.status === 'queued' || item.status === 'uploading'
              ? { ...item, status: 'skipped', reason: { code: 'cancelled' } }
              : item,
          ),
        );
      }

      abortRef.current = null;
      blanketRef.current = null;
      askChainRef.current = Promise.resolve();
      setConflict(null);
      setRunning(false);
      onSettled?.();
    },
    [patch, askConflict],
  );

  const start = useCallback(
    (plan: UploadPlan): void => {
      if (plan.items.length === 0 && plan.emptyDirs.length === 0) return;

      const batch = (batchSeqRef.current += 1);
      const entries: QueueEntry[] = plan.items.map((planItem, index) => ({
        item: {
          id: `${batch}-${index}-${planItem.relPath}`,
          relPath: planItem.relPath,
          size: planItem.file.size,
          status: 'queued',
        },
        file: planItem.file,
      }));

      filesRef.current = new Map(entries.map(entry => [entry.item.id, entry.file]));
      setSource(plan.source);
      setCancelled(false);
      setItems(entries.map(entry => entry.item));
      void runBatch(entries, plan.emptyDirs);
    },
    [runBatch],
  );

  /**
   * Re-send only what failed. Nobody wants to restart 240 files because 3 of them broke — and a file
   * over the size cap is excluded, since sending it again cannot end differently.
   */
  const retryFailed = useCallback((): void => {
    const entries: QueueEntry[] = [];

    for (const item of itemsRef.current) {
      if (item.status !== 'failed' || item.reason?.code === 'too-large') continue;

      const file = filesRef.current.get(item.id);
      if (!file) continue;

      entries.push({ item: { ...item, status: 'queued', reason: undefined }, file });
    }

    if (entries.length === 0) return;

    const retried = new Set(entries.map(entry => entry.item.id));

    setItems(prev =>
      prev.map(item => (retried.has(item.id) ? { ...item, status: 'queued', reason: undefined } : item)),
    );
    void runBatch(entries, []);
  }, [runBatch]);

  const cancel = useCallback((): void => {
    abortRef.current?.abort();
    setCancelled(true);
    // Release a worker waiting on a collision answer; without this it parks forever and the batch
    // never settles.
    resolverRef.current?.(null);
    resolverRef.current = null;
  }, []);

  const dismiss = useCallback((): void => {
    if (running) return;

    filesRef.current = new Map();
    setItems([]);
    setSource(null);
    setCancelled(false);
  }, [running]);

  return {
    items,
    running,
    cancelled,
    limit,
    ceiling,
    source,
    conflict,
    start,
    answerConflict,
    cancel,
    retryFailed,
    dismiss,
  };
}
