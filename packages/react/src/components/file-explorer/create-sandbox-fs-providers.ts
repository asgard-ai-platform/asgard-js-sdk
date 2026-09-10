import { AsgardServiceClient, isHttpError, SandboxChannelScope, SandboxFsListResult } from '@asgard-js/core';
import { FsListDir } from './file-explorer-panel';
import { FsReadFile, FsSaveFile, FsUploadMany, FsWatchFile } from './types';

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg']);

function isImagePath(path: string): boolean {
  const i = path.lastIndexOf('.');

  return i > 0 && IMAGE_EXTS.has(path.slice(i + 1).toLowerCase());
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (): void => resolve(String(reader.result));
    reader.onerror = (): void => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** A directory mutation (mkdir / delete). */
export type FsMutatePath = (sandboxName: string, path: string) => Promise<void>;
/** A src→dst mutation (copy / move / rename). */
export type FsMutateSrcDst = (sandboxName: string, src: string, dst: string) => Promise<void>;
/** Upload a picked file into a directory. */
export type FsUpload = (sandboxName: string, dirPath: string, file: File) => Promise<void>;

export interface SandboxFsProviders {
  listDir: FsListDir;
  readFile: FsReadFile;
  saveFile: FsSaveFile;
  /** Watch one path for changes (`fs/watch` SSE) — drives the FileView's watch-and-reload (AC3). */
  watchFile: FsWatchFile;
  // F-021 Cycle 2 — mutations.
  mkdir: FsMutatePath;
  /** Delete a file (`fs/item`) or directory (`fs/all`, recursive) — routed by `isDir`. */
  remove: (sandboxName: string, path: string, isDir: boolean) => Promise<void>;
  copy: FsMutateSrcDst;
  move: FsMutateSrcDst;
  upload: FsUpload;
  /** Batch-capable upload (F-031) — one call per file, driven by the shared upload queue. */
  uploadMany: FsUploadMany;
  /** Download a file to the browser (`GET fs/file` → `<a download>`). */
  download: (sandboxName: string, path: string, name: string) => Promise<void>;
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export interface SandboxFsProvidersOptions {
  /**
   * Called once a sandbox has failed `UNREACHABLE_THRESHOLD` fs calls in a row at the sandbox level
   * (F-021 AC5). Wire it to `channel.dropSandbox` to take the sandbox out of the dropdown; the next
   * `/channel/metadata` refetch reconciles the authoritative truth either way.
   */
  onSandboxUnreachable?: (sandboxName: string) => void;
  /**
   * The channel that owns these sandboxes (`SandboxChannelScope`). A relay in front of asgard-core proves
   * ownership from it and answers `400` without it — `asgard-freyr-api` does for all eleven sandbox
   * endpoints — so pass `channel.customChannelId` whenever there is a channel. `null` / omitted keeps the
   * pre-0.3.82 URL, which such a relay rejects.
   */
  customChannelId?: string | null;
}

/** Consecutive sandbox-level failures before a sandbox is considered gone (F-021 AC5). */
const UNREACHABLE_THRESHOLD = 3;

/**
 * Does this failure mean "the sandbox is gone" rather than "that path is wrong"? The edge server answers
 * `412` when the sandbox is missing or its RPC endpoint is not ready, and `5xx` when the dial itself
 * fails; a `400` / `404` / `409` is about the path and must never evict a live sandbox.
 */
function isSandboxLevelFailure(error: unknown): boolean {
  return isHttpError(error) && (error.status === 412 || error.status >= 500);
}

type TrackFsCall = <T>(
  sandboxName: string,
  run: () => Promise<T>,
  /**
   * Whether a sandbox-level failure from this call counts toward the eviction threshold. `false` still
   * resets the counter on success — a call that succeeds proves the sandbox is there either way.
   *
   * Only batch upload passes `false`, and only for an attempt it is about to retry: the upload queue
   * backs off and retries exactly the `5xx` this tracker counts, so counting every attempt would evict
   * a live sandbox that was merely pushing back. The terminal attempt is counted, so a sandbox that is
   * genuinely gone still evicts after three failed files (F-031).
   */
  countFailure?: boolean,
) => Promise<T>;

/**
 * Count sandbox-level failures per sandbox and report one that keeps failing (F-021 AC5). Any success
 * resets its counter, so only an unbroken run trips the threshold.
 */
function createFailureTracker(onUnreachable?: (sandboxName: string) => void): TrackFsCall {
  const failures = new Map<string, number>();

  return async function track<T>(sandboxName: string, run: () => Promise<T>, countFailure = true): Promise<T> {
    try {
      const result = await run();
      failures.delete(sandboxName);

      return result;
    } catch (error) {
      if (!countFailure || !isSandboxLevelFailure(error)) throw error;

      const count = (failures.get(sandboxName) ?? 0) + 1;
      failures.set(sandboxName, count);

      if (count >= UNREACHABLE_THRESHOLD) {
        failures.delete(sandboxName);
        onUnreachable?.(sandboxName);
      }

      throw error;
    }
  };
}

/**
 * Wire the core sandbox fs client methods into the `FileExplorerPanel` providers (F-021). Image files
 * resolve to a data URL (for `<img src>`); text files to their decoded string. Every call is routed
 * through the failure tracker so a sandbox that has quietly died stops being offered (AC5).
 */
export function createSandboxFsProviders(
  client: AsgardServiceClient,
  options?: SandboxFsProvidersOptions,
): SandboxFsProviders {
  const track = createFailureTracker(options?.onSandboxUnreachable);
  // One scope object for every call below: the channel cannot change under a given providers instance
  // (the aside rebuilds them when it does), and spreading it keeps each call's own options intact.
  const scope: SandboxChannelScope = options?.customChannelId ? { customChannelId: options.customChannelId } : {};

  return {
    listDir: (sandboxName: string, path: string): Promise<SandboxFsListResult> =>
      track(sandboxName, () => client.sandboxFsList(sandboxName, path, scope)),
    readFile: (sandboxName: string, path: string): Promise<string> =>
      track(sandboxName, async () => {
        const { content } = await client.sandboxFsRead(sandboxName, path, scope);

        return isImagePath(path) ? blobToDataUrl(content) : content.text();
      }),
    saveFile: (sandboxName: string, path: string, text: string): Promise<void> =>
      track(sandboxName, async () => {
        await client.sandboxFsWrite(sandboxName, path, text, scope);
      }),
    // Not tracked: the stream lives for as long as the file is open, so a failure here says nothing
    // about whether the next one-shot fs call would succeed.
    watchFile: (sandboxName: string, path: string, onChange: () => void): (() => void) => {
      const subscription = client.sandboxFsWatch(sandboxName, path, scope).subscribe({
        next: () => onChange(),
        error: () => undefined,
      });

      return (): void => subscription.unsubscribe();
    },
    mkdir: (sandboxName: string, path: string): Promise<void> =>
      track(sandboxName, () => client.sandboxFsMkdir(sandboxName, path, scope)),
    remove: (sandboxName: string, path: string, isDir: boolean): Promise<void> =>
      track(sandboxName, () =>
        isDir ? client.sandboxFsRemoveAll(sandboxName, path, scope) : client.sandboxFsRemove(sandboxName, path, scope),
      ),
    copy: (sandboxName: string, src: string, dst: string): Promise<void> =>
      track(sandboxName, async () => {
        await client.sandboxFsCopy(sandboxName, src, dst, scope);
      }),
    move: (sandboxName: string, src: string, dst: string): Promise<void> =>
      track(sandboxName, () => client.sandboxFsMove(sandboxName, src, dst, scope)),
    upload: (sandboxName: string, dirPath: string, file: File): Promise<void> =>
      track(sandboxName, async () => {
        const dst = `${dirPath.replace(/\/$/, '')}/${file.name}`;
        await client.sandboxFsWrite(sandboxName, dst, file, scope);
      }),
    // Batch upload (F-031). `relPath` may span levels; the sandbox's own write creates the parent
    // directories, so nothing is pre-created here.
    uploadMany: (
      sandboxName: string,
      dirPath: string,
      relPath: string,
      file: File,
      options: { createOnly: boolean; signal: AbortSignal; lastAttempt: boolean },
    ): Promise<void> =>
      track(
        sandboxName,
        async () => {
          const dst = `${dirPath.replace(/\/$/, '')}/${relPath}`;
          await client.sandboxFsWrite(sandboxName, dst, file, {
            ...scope,
            createOnly: options.createOnly,
            signal: options.signal,
          });
        },
        options.lastAttempt,
      ),
    download: (sandboxName: string, path: string, name: string): Promise<void> =>
      track(sandboxName, async () => {
        const { content } = await client.sandboxFsRead(sandboxName, path, scope);
        triggerBlobDownload(content, name);
      }),
  };
}
